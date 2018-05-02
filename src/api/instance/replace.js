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
	let target, source, lbName, elastic_ip, allocation_id;
	assign_elastic_ip = assign_elastic_ip === 'true' : true ? false;

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
			return get_elastic_ip(region, target.InstanceId)
		}
	}).then((eip, alloc_id, assoc_id) => {
		if (assign_elastic_ip) {
			if (!eip || !alloc_id || !assoc_id) {
				throw new Error(`Instance ${target_name} had no EIP, but one was expected`);
			} else {
				// Record eip for next step
				elastic_ip = eip;
				allocation_id = alloc_id;

				// Detach from target
				return detach_elastic_ip(region, assoc_id)
			}
		}
		return true;
	}).then(detach_worked => {
		if (assign_elastic_ip) {
			if (detach_worked) {
				// Attach to source
				return attach_elastic_ip(region, source.InstanceId, allocation_id)
			} else {
				throw new Error(`Failed to detach elastic IP from ${target_name}`)
			}
		}
		return true;
	}).then(attach_worked => function () {
		if (assign_elastic_ip && !attach_worked) {
			throw new Error(`Failed to attach elastic IP to ${source_name}`)
		}
		logger.info(`Terminate ${target_name}`);
		return terminate_instance(region, target.InstanceId);
	});
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
	var params = {
		AllocationId: alloc_id,
		InstanceId: source_instance_id
	};

	return AWSProvider
		.get_ec2(region)
		.associateAddressAsync(params, function(err, data) {
			if (err) {
				console.log("Address Not Associated", err);
				return false;
			} else {
				console.log("Address associated:", data.AssociationId);
				return true;
			}
		});
}

function detach_elastic_ip(region, assoc_id) {
	var params = {
		AssociationId: assoc_id
	};

	return AWSProvider
		.get_ec2(region)
		.disassociateAddressAsync(params, function(err, data) {
			if (err) {
				console.log(err, err.stack);
				return false;
			} else {
				return true;
			}
		});
}

function get_elastic_ip(region, instanceId) {
	var params = {
		Filters: [
			{
				Name: 'instance-id',
				Values: [instanceId]
			}
		]
	};

	return AWSProvider
		.get_ec2(region)
		.describeInstancesAsync(params, function(err, data) {
			if (err) {
				console.log("Error", err);
			} else {
				if (data.Reservations && data.Reservations.length) {
					if (data.Reservations[0].Instances && data.Reservations[0].Instances.length) {
						 return data.Reservations[0].Instances[0].PublicIpAddress;
					} else {
						console.log("Had no elastic IP");
					}
				} else {
					console.log("Data had no length");
				}
			}
		}).then(pub_address => {
			params = {
				PublicIps: [pub_address]
			}
			return AWSProvider
				.get_ec2(region)
				.describeAddressesAsync(params, function(err, data) {
					if (err) {
						console.log("Error", err);
					} else if (data.Addresses && data.Addresses.length) {
						data.Addresses.forEach(address => {
							if (address.AllocationId) {
								 return (pub_address, address.AllocationId, address.AssociationId);
							}
						});
					} else {
						console.log("Data had no length");
					}
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
