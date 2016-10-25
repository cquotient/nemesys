'use strict';

var BB = require('bluebird');

var AWSUtil = require('../aws_util');
var AWSProvider = require('../aws_provider');
var create = require('./create');

var _delay_ms = 30000;

function _parse_sched_actions(sched_actions) {
	return sched_actions.ScheduledUpdateGroupActions.map(function(action){
		return {
			name: action.ScheduledActionName,
			capacity: action.DesiredCapacity,
			recurrence: action.Recurrence
		};
	});
}

function _parse_policies(policies) {
	return policies.ScalingPolicies.map(function(policy){
		var parsed = {
			name: policy.PolicyName,
			adjustment_type: policy.AdjustmentType,
			alarm_names: policy.Alarms.map((alarm) => alarm.AlarmName)
		};
		if(policy.PolicyType === 'StepScaling') {
			parsed.policy_type = 'StepScaling';
			parsed.aggregation_type = policy.MetricAggregationType;
			parsed.step_adjustments = policy.StepAdjustments.map(function(step_adj){
				return {
					lower_bound: step_adj.MetricIntervalLowerBound,
					upper_bound: step_adj.MetricIntervalUpperBound,
					adjustment: step_adj.ScalingAdjustment
				};
			});
		} else {
			parsed.adjustment = policy.ScalingAdjustment;
			parsed.cooldown = policy.Cooldown;
		}
		return parsed;
	});
}

function _parse_lifecycle_hooks(hooks) {
	return hooks.LifecycleHooks.map(function(hook){
		return {
			name: hook.LifecycleHookName,
			default_result: hook.DefaultResult,
			timeout: hook.HeartbeatTimeout,
			lc_transition: hook.LifecycleTransition,
			target_arn: hook.NotificationTargetARN,
			role_arn: hook.RoleARN
		};
	});
}

function _do_replace(region, vpc_name, replace_asg, with_asg, lc_name) {
	var AS = AWSProvider.get_as(region);

	let sched_action_promise = AS.describeScheduledActionsAsync({AutoScalingGroupName: replace_asg}).then(_parse_sched_actions);
	let policy_promise = AS.describePoliciesAsync({AutoScalingGroupName: replace_asg}).then(_parse_policies);

	return BB.all([
		AWSUtil.get_asg(AS, replace_asg),
		AS.describeNotificationConfigurationsAsync({AutoScalingGroupNames: [replace_asg]}),
		sched_action_promise,
		policy_promise,
		AS.describeLifecycleHooksAsync({AutoScalingGroupName: replace_asg}).then(_parse_lifecycle_hooks)
	])
	.spread(function(old_asg, old_notifications, parsed_old_sched_acts, parsed_old_policies, parsed_old_hooks){
		var options = {
			min: old_asg.MinSize,
			max: old_asg.MaxSize,
			desired: old_asg.DesiredCapacity,
			hc_grace: old_asg.HealthCheckGracePeriod,
			elb_name: old_asg.LoadBalancerNames[0],
			scheduled_actions: parsed_old_sched_acts,
			scaling_policies: parsed_old_policies,
			hooks: parsed_old_hooks
		};
		var instance_tags = old_asg.Tags.map(function(tag){
			return `${tag.Key}=${tag.Value}`;
		});
		var error_topic;
		if(old_notifications && old_notifications.NotificationConfigurations.length > 0) {
			error_topic = old_notifications.NotificationConfigurations[0].TopicARN.split(':')[5];
		}
		return create([region], vpc_name, with_asg, lc_name, instance_tags, error_topic, null, options).then(function(){
			return AWSUtil.get_asg(AS, with_asg);
		}).then(function(new_asg){
			console.log(`${region}: new asg ${with_asg} created`);
			console.log(`${region}: waiting for some healthy instances`);
			return new Promise(function(resolve, reject){
				function _check() {
					var new_ready_count = new_asg.Instances.filter(function(instance){
						return instance.LifecycleState === 'InService' && instance.HealthStatus === 'Healthy'
					}).length;
					if(new_ready_count === old_asg.DesiredCapacity) {
						console.log(`${region}: ${with_asg} is ready`);
						resolve();
					} else {
						console.log(`${region}: ${new_ready_count} healthy instances in ${with_asg}, but we want ${old_asg.DesiredCapacity} - waiting 30s`);
						setTimeout(function(){
							AWSUtil.get_asg(AS, with_asg).then(function(asg){
								new_asg = asg;
							}).then(_check);
						}, _delay_ms);
					}
				}
				_check();
			});
		});
	})
	.then(function(){
		console.log(`${region}: removing scheduled actions for ${replace_asg}`);
		return sched_action_promise.then(function(sched_actions){
			return BB.all(sched_actions.map(function(action){
				return AS.deleteScheduledActionAsync({
					AutoScalingGroupName: replace_asg,
					ScheduledActionName: action.name
				});
			}));
		});
	})
	.then(function(){
		console.log(`${region}: removing scaling policies for ${replace_asg}`);
		return policy_promise.then(function(policies){
			return BB.all(policies.map(function(policy){
				return AS.deletePolicyAsync({
					AutoScalingGroupName: replace_asg,
					PolicyName: policy.name
				});
			}));
		});
	})
	.then(function(){
		console.log(`${region}: lowering capacity to 0 for ${replace_asg}`);
		return AS.updateAutoScalingGroupAsync({
			AutoScalingGroupName: replace_asg,
			DesiredCapacity: 0
		}).then(function(){
			return AWSUtil.get_asg(AS, replace_asg);
		});
	})
	.then(function(old_asg){
		return new Promise(function(resolve, reject){
			function _check() {
				if(old_asg.Instances.length > 0) {
					console.log(`${region}: waiting for ${old_asg.Instances.length} instance(s) to terminate`);
					setTimeout(function(){
						AWSUtil.get_asg(AS, replace_asg).then(function(asg){
							old_asg = asg;
						}).then(_check);
					}, _delay_ms);
				} else {
					console.log(`${region}: all instances terminated`);
					resolve();
				}
			}
			_check();
		});
	})
	.then(function(){
		console.log(`${region}: deleting ${replace_asg}`);
		return AS.deleteAutoScalingGroupAsync({
			AutoScalingGroupName: replace_asg
		}).catch(function(err){
			console.error(`${region}: ${err.message}, sleeping and retrying one time...`)
			return BB.delay(_delay_ms).then(function(){
				return AS.deleteAutoScalingGroupAsync({
					AutoScalingGroupName: replace_asg
				});
			});
		});
	});
}

function replace(regions, vpc_name, replace_asg, with_asg, lc_name) {
	var region_promises = regions.map(function(region){
		return _do_replace(region, vpc_name, replace_asg, with_asg, lc_name);
	});
	return BB.all(region_promises);
}

module.exports = replace;
