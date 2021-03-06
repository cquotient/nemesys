'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');
const AWSProvider = require('../aws_provider');
const create = require('./create');

let _delay_ms = 30000;

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
		let parsed = {
			name: policy.PolicyName,
			policy_type: policy.PolicyType
		};
		if(policy.PolicyType === 'StepScaling') {
			parsed.adjustment_type = policy.AdjustmentType,
			parsed.aggregation_type = policy.MetricAggregationType;
			parsed.step_adjustments = policy.StepAdjustments.map(function(step_adj){
				return {
					lower_bound: step_adj.MetricIntervalLowerBound,
					upper_bound: step_adj.MetricIntervalUpperBound,
					adjustment: step_adj.ScalingAdjustment
				};
			});
			parsed.alarm_names = policy.Alarms.map((alarm) => alarm.AlarmName);
		} else if(policy.PolicyType === 'TargetTrackingScaling') {
			parsed.target_tracking_config = policy.TargetTrackingConfiguration;
		} else {
			parsed.adjustment_type = policy.AdjustmentType,
			parsed.adjustment = policy.ScalingAdjustment;
			parsed.cooldown = policy.Cooldown;
			parsed.alarm_names = policy.Alarms.map((alarm) => alarm.AlarmName);
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

function _wait_for_health(region, new_asg_name, new_asg, old_asg) {
	//if old asg and new asg both have 0 desired instances, then we dont expect anything to become healthy, so
	//we can basically skip this step
	if(old_asg.DesiredCapacity === 0 && new_asg.DesiredCapacity === 0) {
		return Promise.resolve();
	}
	//first wait for asg to report that all the instances are healthy
	return new Promise(function(resolve, reject){
		function _check() {
			let new_ready_count = new_asg.Instances.filter(function(instance){
				return instance.LifecycleState === 'InService' && instance.HealthStatus === 'Healthy';
			}).length;
			if(new_ready_count === old_asg.DesiredCapacity) {
				Logger.info(`${region}: asg ${new_asg_name} is ready`);
				resolve();
			} else {
				Logger.info(`${region}: ${new_ready_count} healthy instances in ${new_asg_name}, but we want ${old_asg.DesiredCapacity} - waiting 30s`);
				setTimeout(function(){
					AWSUtil.get_asg(AWSProvider.get_as(region), new_asg_name).then(function(asg){
						new_asg = asg;
					}).then(_check).catch(reject);
				}, _delay_ms);
			}
		}
		_check();
	}).then(function(){
		//then wait for the elb to report that all instances in the asg are healthy in the elb, too
		Logger.info(`${region}: waiting for all hosts to be healthy in load balancer`);
		return new Promise(function(resolve, reject){
			function _check() {
				AWSUtil.get_asg(AWSProvider.get_as(region), new_asg_name).then(function(asg){
					let new_instance_ids = asg.Instances.map((instance) => instance.InstanceId);
					let inst_elb_check_proms = BB.all(asg.LoadBalancerNames.map(function(elb){
						return AWSProvider.get_elb(region).describeInstanceHealthAsync({
							LoadBalancerName: elb,
							Instances: new_instance_ids.map( (inst_id) => ({InstanceId: inst_id}) )
						});
					})).reduce((prev, curr) => {
							return prev.concat(curr.InstanceStates);
						}, []);
					let inst_tg_check_proms = BB.all(asg.TargetGroupARNs.map(function(tg){
						return AWSProvider.get_elbv2(region).describeTargetHealthAsync({
							TargetGroupArn: tg,
							Targets: new_instance_ids.map( (inst_id) => ({Id: inst_id}) )
						});
					})).reduce((prev, curr) => {
							return prev.concat(curr.TargetHealthDescriptions);
						}, []);
					return BB.all([inst_elb_check_proms, inst_tg_check_proms])
						.spread((elb_result, tg_result) => {
							let result = [];
							result = result.concat(elb_result
								.filter(obj => {
									return obj.State === 'InService';
								}).map(instance => {
									return instance.InstanceId;
								})
							);
							result = result.concat(tg_result
								.filter(obj => {
									return obj.TargetHealth.State === 'healthy';
								}).map(instance => {
									return instance.Target.Id;
								})
							);
							return result
								.filter((item, pos, self) => {
									return self.indexOf(item) === pos;
								});
						});
				}).then(function(healthy){
					if(healthy.length !== new_asg.DesiredCapacity) {
						Logger.info(`${region}: found ${healthy.length} healthy instances in load balancer, but we want (${new_asg.DesiredCapacity}) - waiting 30s`);
						setTimeout(_check, _delay_ms);
					} else if(new_asg.DesiredCapacity !== 0) {
						Logger.info(`${region}: all hosts healthy in load balancer`);
						resolve();
					} else {
						//reject here, because this means something weird has happened and
						//we dont want to just hang
						reject(new Error('Unexpected empty asg found!'));
					}
				}).catch(reject);
			}
			_check();
		});
	});
}

function _do_replace(region, vpc_name, replace_asg, with_asg, lc_name) {
	let AS = AWSProvider.get_as(region);

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
		let options = {
			min: old_asg.MinSize,
			max: old_asg.MaxSize,
			desired: old_asg.DesiredCapacity,
			hc_grace: old_asg.HealthCheckGracePeriod,
			elb_name: old_asg.LoadBalancerNames[0],
			tg_arn: old_asg.TargetGroupARNs[0],
			scheduled_actions: parsed_old_sched_acts,
			scaling_policies: parsed_old_policies,
			hooks: parsed_old_hooks
		};
		let instance_tags = old_asg.Tags.map(function(tag){
			return `${tag.Key}=${tag.Value}`;
		});
		let error_topic;
		if(old_notifications && old_notifications.NotificationConfigurations.length > 0) {
			error_topic = old_notifications.NotificationConfigurations[0].TopicARN.split(':')[5];
		}
		return create([region], vpc_name, with_asg, lc_name, instance_tags, error_topic, null, options).then(function(){
			return AWSUtil.get_asg(AS, with_asg);
		}).then(function(new_asg){
			Logger.info(`${region}: new asg ${with_asg} created`);
			Logger.info(`${region}: waiting for some healthy instances`);
			return _wait_for_health(region, with_asg, new_asg, old_asg);
		});
	})
	.then(function(){
		Logger.info(`${region}: removing scheduled actions for ${replace_asg}`);
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
		Logger.info(`${region}: removing scaling policies for ${replace_asg}`);
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
		Logger.info(`${region}: lowering capacity to 0 for ${replace_asg}`);
		return AS.updateAutoScalingGroupAsync({
			AutoScalingGroupName: replace_asg,
			DesiredCapacity: 0,
			MinSize: 0
		}).then(function(){
			return AWSUtil.get_asg(AS, replace_asg);
		});
	})
	.then(function(old_asg){
		return new Promise(function(resolve){
			function _check() {
				if(old_asg.Instances.length > 0) {
					Logger.info(`${region}: waiting for ${old_asg.Instances.length} instance(s) to terminate`);
					setTimeout(function(){
						AWSUtil.get_asg(AS, replace_asg).then(function(asg){
							old_asg = asg;
						}).then(_check);
					}, _delay_ms);
				} else {
					Logger.info(`${region}: all instances terminated`);
					resolve();
				}
			}
			_check();
		});
	})
	.then(function(){
		Logger.info(`${region}: deleting ${replace_asg}`);
		return AS.deleteAutoScalingGroupAsync({
			AutoScalingGroupName: replace_asg
		}).catch(function(err){
			Logger.error(`${region}: ${err.message}, sleeping and retrying one time...`);
			return BB.delay(_delay_ms).then(function(){
				return AS.deleteAutoScalingGroupAsync({
					AutoScalingGroupName: replace_asg
				});
			});
		});
	});
}

function replace(regions, vpc_name, replace_asg, with_asg, lc_name) {
	let region_promises = regions.map(function(region){
		return _do_replace(region, vpc_name, replace_asg, with_asg, lc_name);
	});
	return BB.all(region_promises);
}

module.exports = replace;
