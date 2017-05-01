'use strict';

const Promise = require('bluebird');
const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const logger = require('../../logger');
const Override = require('../override');

module.exports = function (regions, instance_name, rename, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_file, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt) {
	if(!ud_files) ud_files = [];
	if(rud_file) {
		ud_files = [rud_file].concat(ud_files);
	}
	let override_opts = {
		vpc: vpc,
		ami: ami,
		i_type: i_type,
		key_name: key_name,
		sg: sg,
		iam: iam,
		ud_files: ud_files,
		disks: disks,
		az: az,
		tags: tags,
		eni_name: eni_name,
		env_vars: env_vars,
		ebs_opt: ebs_opt
	};
	return Promise.all(regions.map(function (region) {
		return copy(region, instance_name, rename, override_opts);
	}));
};

function copy(region, instance_name, rename, override_opts) {
	return AWSUtil
		.get_instance_by_name(region, instance_name)
		.then(function (instance) {
			logger.info(`Copy attributes from ${instance_name}`);
			return copy_instance_attrs(region, instance.InstanceId);
		})
		.then(function (instance_attrs) {
			return Override.merge_config(region, instance_attrs, override_opts).then(merged => {
				return rename_instance(merged, rename);
			});
		})
		.then(function (params) {
			logger.info(`Start instance ${rename}`);
			return AWSProvider.get_ec2(region).runInstancesAsync(params);
		})
		.then(function (data) {
			logger.info('Wait for instance intialization');
			return wait_until_runnning(region, data.Instances[0].InstanceId);
		});
}

function wait_until_runnning(region, instanceId) {
	return AWSProvider
		.get_ec2(region)
		.waitForAsync('instanceRunning', {
			InstanceIds: [instanceId]
		})
		.then(function (data) {
			const instance = data.Reservations[0].Instances[0];

			if (instance.State.Name !== 'running') {
				throw new Error(instance.StateReason.Message);
			}

			return instance.InstanceId;
		});
}

function rename_instance(instance_attrs, rename) {
	let Tags = instance_attrs.TagSpecifications[0].Tags;

	Tags = [{Key: 'Name', Value: rename}].concat(
		Tags.filter(function (t) {
			return t.Key !== 'Name';
		})
	);

	instance_attrs.TagSpecifications[0].Tags = Tags;
	return instance_attrs;
}

function copy_instance_attrs(region, instanceId) {
	return Promise
		.all([
			get_instance_info(region, instanceId),
			get_instance_userdata(region, instanceId),
			get_instance_volumes(region, instanceId)
		])
		.spread(function (instance_info, instance_userdata, instance_volumes) {
			return Object.assign({}, instance_info, instance_userdata, instance_volumes);
		});
}

function get_instance_info(region, instanceId) {
	return AWSProvider
		.get_ec2(region)
		.describeInstancesAsync({
			InstanceIds: [instanceId]
		})
		.then(function (data) {
			const instance = data.Reservations[0].Instances[0];

			return {
				ImageId: instance.ImageId,
				IamInstanceProfile: {
					Arn: instance.IamInstanceProfile.Arn
				},
				MaxCount: 1,
				MinCount: 1,
				Placement: instance.Placement,
				KeyName: instance.KeyName,
				TagSpecifications: [
					{
						ResourceType: 'instance',
						Tags: instance.Tags
					}
				],
				InstanceType: instance.InstanceType,
				EbsOptimized: instance.EbsOptimized,
				NetworkInterfaces: instance.NetworkInterfaces.map(function (eni) {
					return {
						AssociatePublicIpAddress: true,
						DeviceIndex: 0,
						Groups: eni.Groups.map(function (group) {
							return group.GroupId;
						}),
						SubnetId: eni.SubnetId
					};
				}),
				Monitoring: {
					Enabled: true
				}
			};
		});
}

function get_instance_userdata(region, instanceId) {
	return AWSProvider
		.get_ec2(region)
		.describeInstanceAttributeAsync({
			Attribute: 'userData',
			InstanceId: instanceId
		})
		.then(function (data) {
			return {UserData: data.UserData.Value};
		});
}

function get_instance_volumes(region, instanceId) {
	return AWSProvider
		.get_ec2(region)
		.describeVolumesAsync({
			Filters: [
				{
					Name: "attachment.instance-id",
					Values: [instanceId]
				}
			]
		})
		.then(function (data) {
			const volumes = data.Volumes
				.filter(function (vol) {
					return !!vol.Attachments.length;
				})
				.map(function (vol) {
					return {
						DeviceName: vol.Attachments[0].Device,
						Ebs: {
							VolumeType: vol.VolumeType,
							VolumeSize: vol.Size,
							DeleteOnTermination: vol.Attachments[0].DeleteOnTermination
						}
					};
				});

			return {BlockDeviceMappings: volumes};
		});
}
