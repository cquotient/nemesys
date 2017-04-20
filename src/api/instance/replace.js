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

function replace(region, target_name, source_name) {
	let target, source, lbName;

	return Promise.all([
		AWSUtil.get_instance_by_name(region, target_name),
		AWSUtil.get_instance_by_name(region, source_name)
	]).spread(function (t, s) {
		target = t;
		source = s;
	}).then(function () {
		return get_instance_lb(region, target.InstanceId);
	}).then(function (name) {
		lbName = name;
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

function get_instance_lb(region, instanceId) {
	return get_lbs(region)
		.then(function (lbs) {
			return lbs.find(function (lb) {
				return lb.Instances.some(function (instance) {
					return instance.InstanceId === instanceId;
				});
			});
		})
		.then(function (lb) {
			return lb.LoadBalancerName;
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
