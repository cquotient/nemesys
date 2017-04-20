'use strict';

const Promise = require('bluebird');
const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const logger = require('../../logger');

module.exports = function (regions, instance_name, rename) {
	return Promise.all(regions.map(function (region) {
		return copy(region, instance_name, rename);
	}));
};

function copy(region, instance_name, rename) {
	return AWSUtil
		.get_instance_by_name(region, instance_name)
		.then(function (instance) {
			logger.info(`Copy attributes from ${instance_name}`);
			return copy_instance_attrs(region, instance.InstanceId);
		})
		.then(function (instance_attrs) {
			return rename_instance(instance_attrs, rename);
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
		.spread(function () {
			let args = [].slice.call(arguments);
			return Object.assign.apply(Object, [{}].concat(args));
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
				IamInstanceProfile: pick(instance.IamInstanceProfile, ['Arn']),
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
							DeleteOnTermination: true
						}
					};
				});

			return {BlockDeviceMappings: volumes};
		});
}

function pick(obj, keys) {
	const result = {};
	keys.forEach(function (k) {
		result[k] = obj[k];
	});
	return result;
}
