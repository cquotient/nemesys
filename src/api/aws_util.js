'use strict';

const AWSProvider = require('./aws_provider');
const BB = require('bluebird');
const fs = BB.promisifyAll(require('fs'));

function _get_asg(as, asg_name) {
	return as.describeAutoScalingGroupsAsync({
		AutoScalingGroupNames: [asg_name]
	}).then(function(data){
		return data.AutoScalingGroups[0];
	});
}

function _get_sg_id(region, group_name) {
	let EC2 = AWSProvider.get_ec2(region);
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
	if(!vpc_name) {
		return Promise.resolve();
	}
	return AWSProvider.get_ec2(region).describeVpcsAsync({
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

function _get_userdata_string(file_names, env_vars, raw_ud_string) {
	let ud_files_proms = file_names.map(function(path){
		return fs.readFileAsync(path, 'utf-8');
	});
	return BB.all(ud_files_proms)
	.then(function(ud_files_content){
		// standard beginning of shell script user data, so we dont have to repeat it everywhere
		let user_data_string = '#!/bin/bash\n\n';
		user_data_string += 'set -o pipefail\n';
		user_data_string += 'set -e -x\n';
		user_data_string += 'exec >> /tmp/exec.log 2>&1\n\n';

		// include env vars so userdata scripts can use them
		if(env_vars) {
			user_data_string += '# begin env vars\n';
			env_vars.forEach(function(env){
				user_data_string += `export ${env}\n`;
			});
			user_data_string += '# end env vars\n';
		}

		if(raw_ud_string) {
			ud_files_content.push(raw_ud_string);
		}

		//concat with the rest of the user data
		return ud_files_content.reduce(function(prev, curr) {
			return prev + curr;
		}, user_data_string);
	});
}

function _get_ami_id(region, ami_name) {
	let params = {
		Filters: [
			{
				Name: 'name',
				Values: [ami_name]
			}
		]
	};
return AWSProvider.get_ec2(region).describeImagesAsync(params)
	.then(function(data){
		if(!data.hasOwnProperty('Images') || !data.Images.length) {
			return null;
		}
		return data.Images[0].ImageId;
	});
}

function _get_sg_ids(region, sg) {
	if(!sg) {
		return Promise.resolve();
	}
	let proms = sg.map(function(name){
		return _get_sg_id(region, name);
	});
	return BB.all(proms);
}

function _get_subnet_ids(region, vpc_name, azs) {
	return _get_vpc_id(region, vpc_name)
	.then(function(vpc_id){
		let filters = [
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
		return AWSProvider.get_ec2(region).describeSubnetsAsync({
			Filters: filters
		});
	}).then(function(data){
		return data.Subnets.map((obj) => obj.SubnetId);
	});
}

function _get_bdms(disks) {
	if(!disks) {
		return null;
	}
	return disks.map(function(d){
		let d_split = d.split(':');
		let bdm = {
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

function _get_account_id() {
	return AWSProvider.get_iam().getUserAsync()
	.then(function(resp){
		return resp.User.Arn.split(':')[4];
	});
}

function _get_instance_by_name(region, name) {
	return AWSProvider
		.get_ec2(region)
		.describeInstancesAsync({
			Filters: [
				{
					Name: 'tag:Name',
					Values: [name]
				},
				{
					Name: 'instance-state-name',
					Values: ['running']
				}
			]
		})
		.then(function (data) {
			const instances = data.Reservations.reduce(function (result, current) {
				return result.concat(current.Instances);
			}, []);

			if (!instances.length) {
				throw new Error(`Instance not found: ${name}`);
			}

			if (instances.length > 1) {
				const instanceIds = instances.map(function (instance) {
					return instance.InstanceId;
				});
				throw new Error(`Instance name not unique: ${name} is used by ${instanceIds.join(',')}`);
			}

			return instances[0];
		});
}

function _get_network_interface(region, vpc, az, eni_name, sg) {
	if(!sg || !vpc) {
		return Promise.resolve();
	}
	let subnet_id_promise = _get_subnet_ids(region, vpc, [az]).then((subnet_ids) => subnet_ids[0]);
	let sg_ids_promise = _get_sg_ids(region, sg);
	return BB.all([
		sg_ids_promise,
		subnet_id_promise
	])
	.then(function(results){
		if(eni_name) {
			return _get_eni_id(region, vpc, az, eni_name)
			.then(function(eni_id){
				return {
					DeviceIndex: 0,
					NetworkInterfaceId: eni_id
				};
			});
		} else {
			return Promise.resolve({
				AssociatePublicIpAddress: true,
				DeviceIndex: 0,
				Groups: results[0],
				SubnetId: results[1]
			});
		}
	});
}

function _get_eni_id(region, vpc, az, eni_name) {
	let EC2 = AWSProvider.get_ec2(region);
	return _get_vpc_id(region, vpc)
	.then(function(vpc_id){
		return EC2.describeNetworkInterfacesAsync({
			Filters: [
				{
					Name: 'vpc-id',
					Values: [vpc_id]
				},
				{
					Name: 'availability-zone',
					Values: [region + az]
				},
				{
					Name: 'tag:Name',
					Values: [eni_name]
				}
			]
		});
	}).then(function(data){
		return data.NetworkInterfaces[0].NetworkInterfaceId;
	});
}

exports.get_asg = _get_asg;
exports.get_sg_id = _get_sg_id;
exports.get_vpc_id = _get_vpc_id;
exports.get_userdata_string = _get_userdata_string;
exports.get_ami_id = _get_ami_id;
exports.get_sg_ids = _get_sg_ids;
exports.get_subnet_ids = _get_subnet_ids;
exports.get_account_id = _get_account_id;
exports.get_bdms = _get_bdms;
exports.get_instance_by_name = _get_instance_by_name;
exports.get_network_interface = _get_network_interface;
exports.get_eni_id = _get_eni_id;
