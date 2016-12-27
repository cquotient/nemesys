'use strict';

const AWS = require('aws-sdk');
const BB = require('bluebird');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');

const _delay_ms = 30000;

function _do_update(region, asg_name, lc_name) {
	let AS = BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
	return AS.describeLaunchConfigurationsAsync({
		LaunchConfigurationNames: [lc_name]
	})
	.then(function(lc_resp){
		// make sure the requested launch configuration exists
		if(lc_resp.LaunchConfigurations.length !== 1) {
			return Promise.reject(new Error(`No Launch Configuration found for name "${lc_name}" in ${region}`));
		}
		return AWSUtil.get_asg(AS, asg_name);
		//
	})
	.then(function(asg){
		// make sure we find the auto scaling groups we are looking for
		if(!asg) {
			return Promise.reject(new Error(`No ASG found for name ${asg_name} in ${region}`));
		}
		Logger.info(`${region}: current launch config: ${asg.LaunchConfigurationName}`);
		Logger.info(`${region}: current instance count: ${asg.Instances.length}`);
		Logger.info(`${region}: replacing launch config with ${lc_name}`);
		return AS.updateAutoScalingGroupAsync({
			AutoScalingGroupName: asg_name,
			LaunchConfigurationName: lc_name
		}).then(function(){
			// get updated asg data, in case an instance was added since we updated the launch config
			return AWSUtil.get_asg(AS, asg_name);
		});
		//
	})
	.then(function(asg){
		Logger.info(`${region}: launch config updated, increasing capacity and replacing instances...`);
		return AS.updateAutoScalingGroupAsync({
			AutoScalingGroupName: asg_name,
			DesiredCapacity: asg.DesiredCapacity + 1,
			MaxSize: asg.MaxSize + 1
		}).then(function(){
			return BB.delay(_delay_ms);
		});
	})
	.then(function(){
		return AWSUtil.get_asg(AS, asg_name);
	})
	.then(function(asg){
		return new Promise(function(resolve, reject){
			let timeout;
			function _check(){
				// we need to distinguish between new healthy instances,
				// new unhealthy instances, and old (not terminated) instances
				let new_ready = [], new_not_ready = [], old = [];
				asg.Instances.forEach(function(obj){
					if(obj.LaunchConfigurationName === lc_name) {
						if(obj.LifecycleState === 'InService' && obj.HealthStatus === 'Healthy') {
							new_ready.push(obj);
						} else {
							new_not_ready.push(obj);
						}
					} else if(obj.LifecycleState !== 'Terminating'){
						old.push(obj);
					}
				});
				if(new_not_ready.length === 0) {
					Logger.info(`${region}: ${new_not_ready.length} instance(s) ready with new launch config (${lc_name})`);
					if(old.length === 0) {
						// if all the new instances are ready and there are no old ones left, then we are done
						Logger.info(`${region}: all instances updated, lowering capacity`);
						AS.updateAutoScalingGroupAsync({
							AutoScalingGroupName: asg_name,
							DesiredCapacity: asg.DesiredCapacity - 1,
							MaxSize: asg.MaxSize - 1
						}).then(resolve).catch(reject);
					} else {
						// this means the new instances are ready, so we need to get rid of
						// another old one
						Logger.info(`${region}: ${old.length} instances remaining with old launch config`);
						AS.terminateInstanceInAutoScalingGroupAsync({
							InstanceId: old[0].InstanceId,
							ShouldDecrementDesiredCapacity: false
						}).then(function(){
							timeout = setTimeout(function(){
								AWSUtil.get_asg(AS, asg_name).then(function(_asg){
									asg = _asg;
								}).then(_check);
							}, _delay_ms);
						}).catch(function(err){
							reject(err);
						});
					}
				} else {
					// this means we the new instances aren't ready yet, which could mean
					// we havent waited long enough or there is a problem with the new launch config
					Logger.info(`${region}: waiting for ${new_not_ready.length} instance(s) with new launch config to come online...`);
					timeout = setTimeout(function(){
						AWSUtil.get_asg(AS, asg_name).then(function(_asg){
							asg = _asg;
						}).then(_check);
					}, _delay_ms);
				}
			}
			_check();
			setTimeout(function(){
				clearTimeout(timeout);
				reject(new Error(`Timed out updating instances in ASG in ${region}!`));
			}, _delay_ms * 10);
		});
	});
}

function update(regions, asg_name, lc_name) {
	let region_promises = regions.map(function(region){
		return _do_update(region, asg_name, lc_name);
	});
	return BB.all(region_promises);
}

module.exports = update;
