'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');
var fs = BB.promisifyAll(require('fs'));

var ec2_conns = {};

function _get_ec2(region) {
	if(!ec2_conns[region]) {
		ec2_conns[region] = BB.promisifyAll(new AWS.EC2({
			region: region,
			apiVersion: '2015-10-01'
		}));
	}
	return ec2_conns[region];
}

function _get_asg(as, asg_name) {
	return as.describeAutoScalingGroupsAsync({
		AutoScalingGroupNames: [asg_name]
	}).then(function(data){
		return data.AutoScalingGroups[0];
	});
}

function _get_sg_id(region, group_name) {
	var EC2 = BB.promisifyAll(new AWS.EC2({
		region: region,
		apiVersion: '2015-10-01'
	}));
	return EC2.describeSecurityGroupsAsync({
		DryRun: false,
		Filters: [
			{
				Name: 'group-name',
				Values: [group_name]
			}
		]
	}).then(function(result){
		return result.SecurityGroups[0].GroupId;
	});
}

function _get_vpc_id(region, vpc_name) {
	return _get_ec2(region).describeVpcsAsync({
		Filters: [
			{
				Name: 'tag:Name',
				Values: [vpc_name]
			}
		]
	})
	.then(function(data){
		return data.Vpcs[0].VpcId;
	});
}

function _get_userdata_string(file_names) {
	var ud_files_proms = file_names.map(function(path){
		return fs.readFileAsync(path, 'utf-8');
	});
	return BB.all(ud_files_proms)
	.then(function(ud_files_content){
		// standard beginning of shell script user data, so we dont have to repeat it everywhere
		var user_data_string = '#!/bin/bash\n\n';
		user_data_string += 'set -o pipefail\n';
		user_data_string += 'set -e -x\n';
		user_data_string += 'exec >> /tmp/exec.log 2>&1\n\n';

		//concat with the rest of the user data
		return ud_files_content.reduce(function(prev, curr) {
			return prev + curr;
		}, user_data_string);
	});
}

function _get_ami_id(region, ami_name) {
	var params = {
		Filters: [
			{
				Name: 'name',
				Values: [ami_name]
			}
		]
	};
	return _get_ec2(region).describeImagesAsync(params)
	.then(function(data){
		return data.Images[0].ImageId;
	});
}

function _get_sg_ids(region, sg) {
	var proms = sg.map(function(name){
		return _get_sg_id(region, name);
	});
	return BB.all(proms);
}

function _get_subnet_ids(region, vpc_name, azs) {
	return _get_vpc_id(region, vpc_name)
	.then(function(vpc_id){
		var filters = [
			{
				Name: 'vpc-id',
				Values: [vpc_id]
			}
		];
		if(azs && azs.length > 0) {
			filters.push({
				Name: 'availability-zone',
				Values: azs.map((az) => region + az)
			});
		}
		return _get_ec2(region).describeSubnetsAsync({
			Filters: filters
		});
	}).then(function(data){

		return data.Subnets.map((obj) => obj.SubnetId);
	});
}

function _get_bdms(disks) {
	return disks.map(function(d){
		var d_split = d.split(':');
		var bdm = {
			DeviceName: d_split[0]
		};
		if(d_split[1] === 'ebs') {
			bdm.Ebs = {
				VolumeSize: d_split[2],
				VolumeType: d_split[3],
				DeleteOnTermination: true
			};
		} else { //this means d_split[1] (which is the device type) is 'ephemeral'
			bdm.VirtualName = d_split[2];
		}
		return bdm;
	});
}

exports.get_asg = _get_asg;
exports.get_sg_id = _get_sg_id;
exports.get_vpc_id = _get_vpc_id;
exports.get_userdata_string = _get_userdata_string;
exports.get_ami_id = _get_ami_id;
exports.get_sg_ids = _get_sg_ids;
exports.get_subnet_ids = _get_subnet_ids;

exports.get_bdms =_get_bdms;