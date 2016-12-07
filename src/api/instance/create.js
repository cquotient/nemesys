'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');
var AWSProvider = require('../aws_provider');

function _get_eni_id(ec2, region, vpc, az, eni_name) {
	return AWSUtil.get_vpc_id(region, vpc)
	.then(function(vpc_id){
		return ec2.describeNetworkInterfacesAsync({
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

function _get_network_interface(ec2, region, vpc, az, eni_name, sg_ids_promise, subnet_id_promise) {
	return BB.all([
		sg_ids_promise,
		subnet_id_promise
	])
	.then(function(results){
		if(eni_name) {
			return _get_eni_id(ec2, region, vpc, az, eni_name)
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

function _resolve_instance(ec2, region, instance_id) {
	return new Promise(function(resolve, reject){
		function _check(){
			ec2.describeInstancesAsync({InstanceIds: [instance_id]}).then(function(result){
				if(result.Reservations.length === 1
				&& result.Reservations[0].Instances.length === 1) {
					resolve(instance_id);
				} else {
					console.log(`${region}: waiting for instance ${instance_id} to be ready`);
					setTimeout(_check, 5000);
				}
			}).catch(reject);
		}
		_check();
	});
}

function _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_file, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt) {
	if(!ud_files) ud_files = [];
	if(rud_file) {
		ud_files = [rud_file].concat(ud_files);
	}

	var EC2 = AWSProvider.get_ec2(region);

	var sg_ids_promise = AWSUtil.get_sg_ids(region, sg);
	var subnet_id_promise = AWSUtil.get_subnet_ids(region, vpc, [az]).then((subnet_ids) => subnet_ids[0]);

	return BB.all([
		AWSUtil.get_ami_id(region, ami),
		AWSUtil.get_userdata_string(ud_files, env_vars, raw_ud_string),
		_get_network_interface(EC2, region, vpc, az, eni_name, sg_ids_promise, subnet_id_promise)
	])
	.spread(function(ami_id, userdata_string, network_interface){
		var bdms = AWSUtil.get_bdms(disks);
		return {
			BlockDeviceMappings: bdms,
			EbsOptimized: !!ebs_opt,
			IamInstanceProfile: {
				Name: iam
			},
			ImageId: ami_id,
			InstanceType: i_type,
			KeyName: key_name,
			MaxCount: 1,
			MinCount: 1,
			Monitoring: {
				Enabled: true
			},
			NetworkInterfaces: [network_interface],
			UserData: (new Buffer(userdata_string).toString('base64'))
		};
	})
	.then(function(params){
		console.log(`${region}: launching instance`);
		return EC2.runInstancesAsync(params);
	})
	.then(function(data){
		return _resolve_instance(EC2, region, data.Instances[0].InstanceId);
	})
	.then(function(instance_id){
		if(tags && tags.length > 0) {
			console.log(`${region}: instance ${instance_id} is ready, applying tags`);
			tags = tags.map(function(tag_str){
				var kv = tag_str.split('=');
				return {
					Key: kv[0],
					Value: kv[1]
				};
			});
			return EC2.createTagsAsync({
				Resources: [instance_id],
				Tags: tags
			}).then(() => instance_id);
		} else {
			return instance_id;
		}
	});
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt){
	if( !(az.length === 1 || az.length === regions.length) ) {
		return Promise.reject(new Error(`Must pass either one AZ or one per region. Found ${az.length} for ${regions.length} region(s)`));
	}
	var region_promises = regions.map(function(region, idx){
		let zone = az.length == regions.length ? az[idx] : az[0];
		let rud_file = rud_files && rud_files[idx] ? rud_files[idx] : null;
		return _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_file, raw_ud_string, disks, zone, tags, eni_name, env_vars, ebs_opt);
	});
	return BB.all(region_promises);
}

module.exports = create;
