'use strict';

const Promise = require('bluebird');

const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const logger = require('../../logger');
const health_check = require('../health_checks');

module.exports = function (regions, target_name, source_name, reassociate_eip) {
	return Promise.all(regions.map(function (region) {
		return replace(region, target_name, source_name, reassociate_eip);
	}));
};

function replace(region, target_name, source_name, reassociate_eip) {
	let target, source, lbName;

	return Promise.all([
		AWSUtil.get_instance_by_name(region, target_name),
		AWSUtil.get_instance_by_name(region, source_name)
	]).spread(function (t, s) {
		target = t;
		source = s;
	}).then(function () {
		return get_instance_lb(region, target.InstanceId);
	}).then(function (lb) {
		if (lb == null) {
			throw new Error(`Instance ${target_name} is not linked to a load balancer`);
		}

		lbName = lb.LoadBalancerName;
	}).then(function () {
		logger.info(`Attach ${source_name} to ${lbName}`);
		return attach_to_lb(region, lbName, source.InstanceId);
	}).then(function () {
		logger.info(`Health check for ${source_name}`);
		return health_check.wait_until_healthy(region, lbName, source.InstanceId);
	}).then(function () {
		logger.info(`Detach ${target_name} from ${lbName}`);
		return detach_from_lb(region, lbName, target.InstanceId);
	}).then(function () {
		if (reassociate_eip) {
			return get_elastic_ip(region, target.InstanceId);
		}
	}).then(eip_hash => {
		if (reassociate_eip) {
			if (eip_hash && eip_hash.alloc_id && eip_hash.assoc_id) {
				logger.info(`${region}: Alloc ID: ${eip_hash.alloc_id}`);
				logger.info(`${region}: Assoc ID: ${eip_hash.assoc_id}`);

				// Detach from target
				logger.info(`${region}: Detach EIP from ${target_name}`);
				return AWSUtil.detach_elastic_ip(region, eip_hash.assoc_id)
					.then(() => {
						return eip_hash.alloc_id;
					});
			}
		}
	}).then((alloc_id) => {
		if (reassociate_eip && alloc_id) {
			logger.info(`${region}: Attach EIP to ${source_name}`);
			return AWSUtil.attach_elastic_ip(region, source.InstanceId, alloc_id);
		}
	}).then(() => {
		logger.info(`${region}: Terminate ${target_name}`);
		return terminate_instance(region, target.InstanceId);
	});
}

function get_elastic_ip(region, target_instance_id) {
	let params = {
		Filters: [
			{
				Name: 'instance-id',
				Values: [target_instance_id]
			}
		]
	};

	return AWSProvider
		.get_ec2(region)
		.describeInstancesAsync(params)
		.then(data => {
			if (data && data.Reservations && data.Reservations.length &&
				data.Reservations[0].Instances && data.Reservations[0].Instances.length) {
				return data.Reservations[0].Instances[0].PublicIpAddress;
			}
		}).then(pub_address => {
			if (!pub_address) {
				return;
			}
			return AWSUtil.get_eip_info(region, pub_address);
		});
}

function get_instance_lb(region, instanceId) {
	return get_lbs(region)
		.then(function (lbs) {
			return lbs.find(function (lb) {
				return lb.Instances.some(function (instance) {
					return instance.InstanceId === instanceId;
				});
			});
		});
}

function get_lbs(region) {
	return AWSProvider
		.get_elb(region)
		.describeLoadBalancersAsync()
		.then(function (data) {
			return data.LoadBalancerDescriptions;
		})
		.catch(function () {
			return [];
		});
}


function attach_to_lb(region, lbName, instanceId) {
	return AWSProvider
		.get_elb(region)
		.registerInstancesWithLoadBalancerAsync({
			Instances: [{InstanceId: instanceId}],
			LoadBalancerName: lbName
		});
}

function detach_from_lb(region, lbName, instanceId) {
	return AWSProvider
		.get_elb(region)
		.deregisterInstancesFromLoadBalancerAsync({
			Instances: [{InstanceId: instanceId}],
			LoadBalancerName: lbName
		});
}

function terminate_instance(region, instanceId) {
	return AWSProvider
		.get_ec2(region)
		.terminateInstancesAsync({
			InstanceIds: [instanceId]
		});
}
