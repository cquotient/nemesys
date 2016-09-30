'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');
var AWSProvider = require('../aws_provider');

function _apply_default_options(optional) {
	optional = optional || {};
	if(!optional.min) optional.min = 0;
	if(!optional.max) optional.max = 1;
	if(!optional.desired) optional.desired = 0;
	if(!optional.hc_grace) optional.hc_grace = 300;
	return optional;
}

function _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional){
	optional = _apply_default_options(optional);
	var AS = AWSProvider.get_as(region);
	var EC2 = AWSProvider.get_ec2(region);
	// first, get a list of subnets for our vpc in that region
	return AWSUtil.get_subnet_ids(region, vpc_name, azs)
	.then(function(subnets){
		// then, create an asg with those subnets
		console.log(`${region}: found ${subnets.length} subnets`);
		var tags;
		var create_params = {
			AutoScalingGroupName: asg_name,
			LaunchConfigurationName: lc_name,
			VPCZoneIdentifier: subnets.join(','),
			TerminationPolicies: ['ClosestToNextInstanceHour'],
			// TODO i want the size to vary by region...
			MinSize: optional.min,
			MaxSize: optional.max,
			DesiredCapacity: optional.desired,
			HealthCheckGracePeriod: optional.hc_grace
		};
		if(instance_tags) {
			console.log(`${region}: applying tags`);
			var tags = instance_tags.map(function(tag_str){
				var kv = tag_str.split('=');
				return {
					Key: kv[0],
					Value: kv[1]
				}
			});
			create_params.Tags = tags;
		}
		if(optional.elb_name) {
			create_params.LoadBalancerNames = [ optional.elb_name ];
			create_params.HealthCheckType = 'ELB';
		}
		return AS.createAutoScalingGroupAsync(create_params);
	})
	// add notifications
	.then(function(asg){
		if(error_topic) {
			console.log(`${region}: adding notification for topic ${error_topic}`);
			return AWSUtil.get_account_id().then(function(id){
				return AS.putNotificationConfigurationAsync({
					AutoScalingGroupName: asg_name,
					NotificationTypes: ['autoscaling:EC2_INSTANCE_LAUNCH_ERROR', 'autoscaling:EC2_INSTANCE_TERMINATE_ERROR'],
					TopicARN: `arn:aws:sns:${region}:${id}:${error_topic}`
				});
			}).then(function(){
				return AWSUtil.get_asg(AS,asg_name);
			});
		} else {
			return AWSUtil.get_asg(AS,asg_name);
		}
	})
	// add scheduled actions
	.then(function(asg){
		if(optional.scheduled_actions) {
			console.log(`${region}: adding scheduled actions`);
			var action_promises = optional.scheduled_actions.map(function(action){
				return AS.putScheduledUpdateGroupActionAsync({
					AutoScalingGroupName: asg_name,
					ScheduledActionName: action.name,
					DesiredCapacity: action.capacity,
					Recurrence: action.recurrence
				});
			});
			return BB.all(action_promises).then(function(){
				return AWSUtil.get_asg(AS, asg_name);
			});
		} else {
			return Promise.resolve(asg);
		}
	});
}

function create(regions, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional){
	var region_promises = regions.map(function(region){
		return _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional);
	});
	return BB.all(region_promises);
}

module.exports = create;
