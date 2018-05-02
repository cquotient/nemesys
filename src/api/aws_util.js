'use strict';

const AWSProvider = require('./aws_provider');
const Logger = require('../logger');

const BB = require('bluebird');
const fs = BB.promisifyAll(require('fs'));

function _get_asg(as, asg_name, retry_timeout = 60000, throttle_retries = 1) {
	return as.describeAutoScalingGroupsAsync({
		AutoScalingGroupNames: [asg_name]
	}).then(function(data){
		return data.AutoScalingGroups[0];
	}).catch(function(err){
		if(err.code === 'Throttling' && throttle_retries > 0) {
			throttle_retries--;
			Logger.info(`Handling aws throttle for describe asg, waiting ${retry_timeout/1000} seconds and retrying, up to ${throttle_retries} more times.`);
			return new Promise(function(resolve, reject){
				setTimeout(() => _get_asg(as, asg_name, throttle_retries, retry_timeout).then(resolve).catch(reject), retry_timeout);
			});
		}
		return new Error(`Error describing asg: `, err);
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
		return Promise.reject(new Error('Must provide a VPC name.'));
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
		return Promise.reject(new Error('Must provide a list of security groups'));
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

function _get_snapshot_id_for_name(region, snapshot_name) {
	return AWSProvider.get_ec2(region).describeSnapshotsAsync({
		Filters: [
			{
				Name: 'tag:Name',
				Values: [snapshot_name]
			}
		]
	}).then(function(response){
		return response.Snapshots[0].SnapshotId;
	});
}

function _get_bdms(region, disks) {
	if(!disks) {
		return null;
	}
	return BB.all(disks.map(function(d){
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
		if(bdm.Ebs && d_split[4]) {
			return _get_snapshot_id_for_name(region, d_split[4]).then(function(snapshot_id){
				bdm.Ebs.SnapshotId = snapshot_id;
				return bdm;
			});
		} else {
			return Promise.resolve(bdm);
		}
	}));
}

function _get_account_id() {
	return AWSProvider.get_iam().getUserAsync()
	.then(function(resp){
		return resp.User.Arn.split(':')[4];
	});
}

function _get_instance_tag_specifications(tags) {
	if(!tags || !tags.length) {
		return null;
	}
	let split_tags;
	if (tags && tags.length > 0) {
		split_tags = tags.map(function(tag_str) {
			let kv = tag_str.split('=');
			return {Key: kv[0], Value: kv[1]};
		});
	}
	return [{
		ResourceType: 'instance',
		Tags: split_tags
	}];
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
		return Promise.reject(new Error('Must provide security groups and VPC'));
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

function _get_ud_files(ud_files, rud_files, region_index) {
	// TODO: currently instance copy/create do not support raw userdata strings.
	let rud_file = rud_files && rud_files[region_index] ? rud_files[region_index] : null;
	if(!ud_files) ud_files = [];
	if(rud_file) {
		ud_files = [rud_file].concat(ud_files);
	}
	return ud_files;
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

// uses waitFor to poll an instance for a specific state
// state can be any state accepted by waitForAysnc
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#waitFor-property
function _wait_until_status(region, instanceId, state) {
	return AWSProvider
		.get_ec2(region)
		.waitForAsync(state, {
			InstanceIds: [instanceId]
		})
		.then(function (data) {
			const instance = data.Reservations[0].Instances[0];

			if (state == 'instanceRunning' && instance.State.Name !== 'running') {
				throw new Error(instance.StateReason.Message);
			}

			return instance.InstanceId;

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
exports.get_instance_tag_specifications = _get_instance_tag_specifications;
exports.get_instance_by_name = _get_instance_by_name;
exports.get_network_interface = _get_network_interface;
exports.get_eni_id = _get_eni_id;
exports.get_ud_files = _get_ud_files;
exports.wait_until_status = _wait_until_status;
