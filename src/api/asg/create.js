'use strict';

let BB = require('bluebird');

let AWSUtil = require('../aws_util');
let AWSProvider = require('../aws_provider');

function _apply_default_options(optional) {
	optional = optional || {};
	if(!optional.min) optional.min = 0;
	if(!optional.max) optional.max = 1;
	if(!optional.desired) optional.desired = 0;
	if(!optional.hc_grace) optional.hc_grace = 300;

	if(!optional.hooks) optional.hooks = [];
	return optional;
}

function _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional){
	optional = _apply_default_options(optional);
	let AS = AWSProvider.get_as(region);

	// first, get a list of subnets for our vpc in that region
	return AWSUtil.get_subnet_ids(region, vpc_name, azs)
	.then(function(subnets){
		// then, create an asg with those subnets
		console.log(`${region}: found ${subnets.length} subnets`);
		let create_params = {
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
			let tags = instance_tags.map(function(tag_str){
				let kv = tag_str.split('=');
				return {
					Key: kv[0],
					Value: kv[1]
				};
			});
			create_params.Tags = tags;
		}
		if(optional.elb_name) {
			create_params.LoadBalancerNames = [ optional.elb_name ];
			create_params.HealthCheckType = 'ELB';
		}
		return AS.createAutoScalingGroupAsync(create_params);
	})
	// enable metric collection
	.then(function(asg){
		return AS.enableMetricsCollectionAsync({AutoScalingGroupName: asg_name, Granularity: '1Minute'})
		.then(() => asg);
	})
	// add lifecycle hooks
	.then(function(asg){
		let hook_promises = optional.hooks.map(function(hook){
			return AS.putLifecycleHookAsync({
				AutoScalingGroupName: asg_name,
				LifecycleHookName: hook.name,
				DefaultResult: hook.default_result,
				HeartbeatTimeout: hook.timeout,
				LifecycleTransition: hook.lc_transition,
				NotificationTargetARN: hook.target_arn,
				RoleARN: hook.role_arn
			});
		});
		return BB.all(hook_promises).then(() => asg);
	})
	// add notifications
	.then(function(){
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
			let action_promises = optional.scheduled_actions.map(function(action){
				return AS.putScheduledUpdateGroupActionAsync({
					AutoScalingGroupName: asg_name,
					ScheduledActionName: action.name,
					DesiredCapacity: action.capacity,
					Recurrence: action.recurrence
				});
			});
			return BB.all(action_promises).then(() => AWSUtil.get_asg(AS, asg_name));
		} else {
			return Promise.resolve(asg);
		}
	})
	// add scaling policies
	.then(function(asg){
		if(optional.scaling_policies) {
			let policy_promises = optional.scaling_policies.map(function(policy){
				let policy_params = {
					AutoScalingGroupName: asg_name,
					PolicyName: policy.name,
					AdjustmentType: policy.adjustment_type
				};
				if(policy.policy_type === 'StepScaling') {
					policy_params.PolicyType = 'StepScaling';
					policy_params.MetricAggregationType = policy.aggregation_type;
					policy_params.StepAdjustments = policy.step_adjustments.map(function(obj){
						return {
							MetricIntervalLowerBound: obj.lower_bound,
							MetricIntervalUpperBound: obj.upper_bound,
							ScalingAdjustment: obj.adjustment
						};
					});
				} else {
					policy_params.ScalingAdjustment = policy.adjustment;
					policy_params.Cooldown = policy.cooldown;
				}
				return AS.putScalingPolicyAsync(policy_params).then(function(put_policy_result){
					return AWSProvider.get_cw(region).describeAlarmsAsync({
						AlarmNames: policy.alarm_names
					}).then(function(desc_alarm_result){
						let alarm_promises = desc_alarm_result.MetricAlarms.map(function(alarm){
							return AWSProvider.get_cw(region).putMetricAlarmAsync({
								AlarmName: alarm.AlarmName,
								MetricName: alarm.MetricName,
								Namespace: alarm.Namespace,
								Statistic: alarm.Statistic,
								Period: alarm.Period,
								Threshold: alarm.Threshold,
								ComparisonOperator: alarm.ComparisonOperator,
								Dimensions: alarm.Dimensions,
								EvaluationPeriods: alarm.EvaluationPeriods,
								AlarmActions: [put_policy_result.PolicyARN]
							});
						});
						return BB.all(alarm_promises);
					});
				});
			});
			return BB.all(policy_promises).then(() => AWSUtil.get_asg(AS, asg_name));
		} else {
			return Promise.resolve(asg);
		}
	});
}

function create(regions, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional){
	let region_promises = regions.map(function(region){
		return _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, azs, optional);
	});
	return BB.all(region_promises);
}

module.exports = create;
