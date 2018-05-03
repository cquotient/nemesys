'use strict';

const Promise = require('bluebird');

const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const logger = require('../../logger');

module.exports = function (regions, target_name, source_name) {
	return Promise.all(regions.map(function (region) {
		return replace(region, target_name, source_name);
	}));
};

function replace(region, target_name, source_name, assign_elastic_ip) {
	let target, source, lbName, allocation_id;

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
		return wait_until_healthy(region, lbName, source.InstanceId);
	}).then(function () {
		logger.info(`Detach ${target_name} from ${lbName}`);
		return detach_from_lb(region, lbName, target.InstanceId);
	}).then(function () {
		if (assign_elastic_ip) {
			return get_elastic_ip(region, target.InstanceId);
		}
	}).then((alloc_id, assoc_id) => {
		if (assign_elastic_ip) {
			if (!alloc_id || !assoc_id) {
				logger.warn(`Instance ${target_name} had no EIP, but one was expected`);
			} else {
				logger.info(`Alloc ID: ${alloc_id}`);
				logger.info(`Assoc ID: ${assoc_id}`);

				// Allocation ID needed to attach EIP in next step
				allocation_id = alloc_id;

				// Detach from target
				logger.info(`Detach EIP from ${target_name}`);
				return detach_elastic_ip(region, assoc_id);
			}
		}
		return Promise.resolve(true);
	}).then(() => {
		if (assign_elastic_ip && allocation_id) {
			logger.info(`Attach EIP to ${source_name}`);
			return attach_elastic_ip(region, source.InstanceId, allocation_id);
		}
		return Promise.resolve(true);
	}).then(() => {
		logger.info(`Terminate ${target_name}`);
		return terminate_instance(region, target.InstanceId);
	}).catch(err => logger.error(err));
}

function wait_until_healthy(region, lbName, instanceId) {
	return AWSProvider
		.get_elb(region)
		.waitForAsync('instanceInService', {
			LoadBalancerName: lbName,
			Instances: [
				{
					InstanceId: instanceId
				}
			]
		})
		.then(function (data) {
			const state = data.InstanceStates[0];

			if (state.State !== 'InService') {
				throw new Error(state.Description);
			}
		});
}

function attach_elastic_ip(region, source_instance_id, alloc_id) {
	let params = {
		AllocationId: alloc_id,
		InstanceId: source_instance_id
	};

	return AWSProvider
		.get_ec2(region)
		.associateAddressAsync(params, function(err, data) {
			if (err) {
				logger.error(`Address was not associated to ${source_instance_id}`, err);
				return Promise.reject(new Error(`Address was not associated to ${source_instance_id}`));
			} else {
				logger.info(`Address associated to ${source_instance_id} via association ID ${data.AssociationId}`);
				return Promise.resolve(true);
			}
		});
}

function detach_elastic_ip(region, assoc_id) {
	let params = {
		AssociationId: assoc_id
	};

	return AWSProvider
		.get_ec2(region)
		.disassociateAddressAsync(params, function(err, data) {
			if (err) {
				return Promise.reject(new Error(`Failed to detach elastic IP with association ID ${assoc_id}`));
			} else {
				return Promise.resolve(data);
			}
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
		.describeInstancesAsync(params, function(err, data) {
			if (err) {
				logger.warn(`We were unable to get instance description for target ${target_instance_id}`);
			} else {
				if (data.Reservations && data.Reservations.length) {
					if (data.Reservations[0].Instances && data.Reservations[0].Instances.length) {
						return data.Reservations[0].Instances[0].PublicIpAddress;
					} else {
						logger.info(`The target instance ${target_instance_id} had no elastic IP`);
					}
				} else {
					logger.warn("We received no data from describe instances while getting elastic IP info");
				}
			}
		}).then(pub_address => {
			params = {
				PublicIps: [pub_address]
			};
			return AWSProvider
				.get_ec2(region)
				.describeAddressesAsync(params, function(err, data) {
					if (err) {
						logger.info(`We were unable to verify if the address ${pub_address} is an elastic IP`);
					} else if (data.Addresses && data.Addresses.length) {
						data.Addresses.forEach(address => {
							if (address.AllocationId) {
								return Promise.resolve((address.AllocationId, address.AssociationId));
							}
						});
					} else {
						logger.warn("We received no data from describe addresses while getting elastic IP info");
					}
					Promise.resolve();
				});
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
