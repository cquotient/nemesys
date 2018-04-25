'use strict';

describe('replace asg', function(){
	let replace,
			sandbox,
			expect,
			describe_asg_spy,
			describe_notifcations_spy,
			describe_sched_acts_spy,
			describe_scaling_policy_spy,
			create_asg_spy,
			put_notifcation_spy,
			put_sched_action_spy,
			put_scaling_policy_spy,
			update_asg_spy,
			delete_asg_spy,
			enable_metrics_spy,
			describe_hooks_spy,
			put_hook_spy,
			describe_vpcs_spy,
			describe_subnets_spy,
			describe_alarms_spy,
			put_alarm_spy,
			del_sched_act_spy,
			del_policy_spy,
			desc_inst_health_spy,
			desc_target_health_spy;

	before(function(){
		replace = require('../../../src/api/asg/replace');
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		sandbox = require('sinon').sandbox.create();
		const mock_as = {
			describeAutoScalingGroupsAsync: function(params) {

				let loadbalancernames, targetgrouparns, instances;

				if(params.AutoScalingGroupNames
				&& params.AutoScalingGroupNames.length === 1) {
					let name = params.AutoScalingGroupNames[0];

					if(name === 'fake-new-asg') {
						loadbalancernames = ['fake-elb1'];
						targetgrouparns = ['fake-tg-arn'];
						instances = [{
							LifecycleState: 'InService',
							HealthStatus: 'Healthy',
							InstanceId: 'fake-instance-id-1'
						}];
					} else if(name === 'fake-old-asg') {
						loadbalancernames = ['fake-elb1'];
						targetgrouparns = ['fake-tg-arn'];
						instances = [];
					}

					//TODO: need a way to fake having instances become healthy
					return Promise.resolve({
						AutoScalingGroups: [
							{
								AutoScalingGroupName: params.AutoScalingGroupNames[0],
								AutoScalingGroupARN: 'fake-asg-arn',
								LaunchConfigurationName: 'fake-asg-lc',
								MinSize: 0,
								MaxSize: 2,
								DesiredCapacity: 1,
								DefaultCooldown: 120,
								AvailabilityZones: [
									'fake-az1',
									'fake-az2'
								],
								LoadBalancerNames: loadbalancernames,
								TargetGroupARNs: targetgrouparns,
								HealthCheckType: 'elb',
								HealthCheckGracePeriod: 60,
								Instances: instances,
								Tags: [
									{
										Key: 'Name',
										Value: 'fake-name'
									}
								]
							}
						]
					});

				} else {
					return Promise.reject(new Error('bad arg for mocked describeAutoScalingGroupsAsync'));
				}
			},
			describeNotificationConfigurationsAsync: function(params){
				return Promise.resolve({
					NotificationConfigurations: [
						{
							TopicARN: ':::::fake-err-topic'
						}
					]
				});
			},
			describeScheduledActionsAsync: function(params){
				if(params.AutoScalingGroupName) {
					return Promise.resolve({
						ScheduledUpdateGroupActions: [
							{
								ScheduledActionName: 'fake-sched-action-1',
								DesiredCapacity: 10,
								Recurrence: 'fake-recurrence'
							}
						]
					});
				} else {
					return Promise.reject(new Error('bad arg for mocked describeScheduledActionsAsync'));
				}
			},
			describePoliciesAsync: function(params){
				return Promise.resolve({
					ScalingPolicies: [
						{
							AutoScalingGroupName: params.AutoScalingGroupName,
							PolicyName: 'fake-scaling-policy-1',
							PolicyARN: 'fake-policy-arn-1',
							PolicyType: 'SimpleScaling',
							AdjustmentType: 'ChangeInCapacity',
							ScalingAdjustment: 2,
							Cooldown: 1200,
							Alarms: [
								{
									AlarmName: 'fake-alarm-1',
									AlarmARN: 'fake-alarm-arn-1'
								}
							]
						},
						{
							AutoScalingGroupName: params.AutoScalingGroupName,
							PolicyName: 'fake-scaling-policy-2',
							PolicyARN: 'fake-policy-arn-2',
							PolicyType: 'StepScaling',
							AdjustmentType: 'ChangeInCapacity',
							MetricAggregationType: 'Maximum',
							EstimatedInstanceWarmup: 300,
							StepAdjustments: [
								{
									MetricIntervalLowerBound: 0,
									MetricIntervalUpperBound: 100,
									ScalingAdjustment: 1
								},
								{
									MetricIntervalLowerBound: 100,
									MetricIntervalUpperBound: 200,
									ScalingAdjustment: 2
								},
								{
									MetricIntervalLowerBound: 200,
									ScalingAdjustment: 3
								}
							],
							Alarms: [
								{
									AlarmName: 'fake-alarm-2',
									AlarmARN: 'fake-alarm-arn-2'
								}
							]
						}
					]
				});
			},
			createAutoScalingGroupAsync: function(params){
				return Promise.resolve({});
			},
			updateAutoScalingGroupAsync: function(params){
				return Promise.resolve({});
			},
			deleteAutoScalingGroupAsync: function(params){
				return Promise.resolve({});
			},
			putNotificationConfigurationAsync: function(params){
				return Promise.resolve({});
			},
			putScheduledUpdateGroupActionAsync: function(params){
				return Promise.resolve({});
			},
			putScalingPolicyAsync: function(params){
				return Promise.resolve({
					PolicyARN: 'fake-policy-arn-2'
				});
			},
			enableMetricsCollectionAsync: function(params){
				return Promise.resolve({});
			},
			describeLifecycleHooksAsync: function(params){
				return Promise.resolve({
					LifecycleHooks: [
						{
							LifecycleHookName: 'fake-hook-name',
							AutoScalingGroupName: params.AutoScalingGroupName,
							LifecycleTransition: 'autoscaling:EC2_INSTANCE_TERMINATING',
							NotificationTargetARN: 'fake-target-arn',
							RoleARN: 'fake-role-arn',
							HeartbeatTimeout: 1800,
							GlobalTimeout: 172800,
							DefaultResult: 'ABANDON' }
					]
				});
			},
			putLifecycleHookAsync: function(params){
				return Promise.resolve({});
			},
			deleteScheduledActionAsync: function(params){
				return Promise.resolve({});
			},
			deletePolicyAsync: function(params){
				return Promise.resolve({});
			}
		};
		describe_asg_spy = sandbox.spy(mock_as, 'describeAutoScalingGroupsAsync');
		describe_notifcations_spy = sandbox.spy(mock_as, 'describeNotificationConfigurationsAsync');
		describe_sched_acts_spy = sandbox.spy(mock_as, 'describeScheduledActionsAsync');
		describe_scaling_policy_spy = sandbox.spy(mock_as, 'describePoliciesAsync');
		create_asg_spy = sandbox.spy(mock_as, 'createAutoScalingGroupAsync');
		put_notifcation_spy = sandbox.spy(mock_as, 'putNotificationConfigurationAsync');
		put_sched_action_spy = sandbox.spy(mock_as, 'putScheduledUpdateGroupActionAsync');
		put_scaling_policy_spy = sandbox.spy(mock_as, 'putScalingPolicyAsync');
		update_asg_spy = sandbox.spy(mock_as, 'updateAutoScalingGroupAsync');
		delete_asg_spy = sandbox.spy(mock_as, 'deleteAutoScalingGroupAsync');
		enable_metrics_spy = sandbox.spy(mock_as, 'enableMetricsCollectionAsync');
		describe_hooks_spy = sandbox.spy(mock_as, 'describeLifecycleHooksAsync');
		put_hook_spy = sandbox.spy(mock_as, 'putLifecycleHookAsync');
		del_sched_act_spy = sandbox.spy(mock_as, 'deleteScheduledActionAsync');
		del_policy_spy = sandbox.spy(mock_as, 'deletePolicyAsync');
		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_as', () => mock_as);

		const mock_ec2 = {
			describeVpcsAsync: function(params){
				if(params.Filters
				&& params.Filters.length > 0) {
					return Promise.resolve({
						Vpcs: [
							{
								VpcId: 'fake-vpc-id'
							}
						]
					});
				} else {
					return Promise.reject(new Error('bad arg for mocked describeVpcsAsync'));
				}
			},
			describeSubnetsAsync: function(params){
				return Promise.resolve({
					Subnets: [
						{
							SubnetId: 'fake-subnet-1'
						},
						{
							SubnetId: 'fake-subnet-2'
						}
					]
				});
			}
		};
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		describe_vpcs_spy = sandbox.spy(mock_ec2, 'describeVpcsAsync');
		describe_subnets_spy = sandbox.spy(mock_ec2, 'describeSubnetsAsync');

		const mock_iam = {
			getUserAsync: function(){
				return Promise.resolve({
					"User":{"Arn":"arn:aws:iam::fake-account-id:user/jane.doe"}
				});
			}
		};
		sandbox.stub(AWSProvider, 'get_iam', () => mock_iam);

		const mock_cloudwatch = {
			describeAlarmsAsync: function(params){
				return Promise.resolve({
					MetricAlarms: [
						{
							AlarmName: 'fake-alarm-1',
							MetricName: 'fake-metric-name-1',
							Namespace: 'fake-metric-namespace-1',
							Statistic: 'fake-statistic-1',
							Period: 300,
							Threshold: 1000,
							ComparisonOperator: 'fake-comp-operator-1',
							Dimensions: [{Name: 'QueueName', Value: 'fake-queue-1'}],
							EvaluationPeriods: 1
						}
					]
				});
			},
			putMetricAlarmAsync: function(params){
				return Promise.resolve({});
			}
		};
		sandbox.stub(AWSProvider, 'get_cw', () => mock_cloudwatch);
		describe_alarms_spy = sandbox.spy(mock_cloudwatch, 'describeAlarmsAsync');
		put_alarm_spy = sandbox.spy(mock_cloudwatch, 'putMetricAlarmAsync');

		const mock_elb = {
			describeInstanceHealthAsync: function(params){
				//TODO need a way to fake instance starting unhealthy and becoming healthy!
				return Promise.resolve({
					InstanceStates: [
						{
							InstanceId: 'fake-instance-id-1',
							State: 'InService'
						}
					]
				});
			}
		};
		sandbox.stub(AWSProvider, 'get_elb', () => mock_elb);
		desc_inst_health_spy = sandbox.spy(mock_elb, 'describeInstanceHealthAsync');

		const mock_elbv2 = {
			describeTargetHealthAsync: function(params){
				return Promise.resolve({
					TargetHealthDescriptions: [
						{
							Target: {
								Id: 'fake-instance-id-2'
							},
							TargetHealth: {
								State: 'healthy'
							}
						}
					]
				});
			}
		};
		sandbox.stub(AWSProvider, 'get_elbv2', () => mock_elbv2);
		desc_target_health_spy = sandbox.spy(mock_elbv2, 'describeTargetHealthAsync');
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should replace an asg in many regions, with a new launch config', function(){
		this.timeout(35000);
		return replace(['us-east-1', 'us-west-2'], 'fake-vpc', 'fake-old-asg', 'fake-new-asg', 'fake-new-lc')
		.then(function(result){
			expect(describe_asg_spy).to.have.been.calledWith({
				AutoScalingGroupNames: ['fake-old-asg']
			});
			expect(describe_notifcations_spy).to.have.been.calledWith({
				AutoScalingGroupNames: ['fake-old-asg']
			});
			expect(describe_sched_acts_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg'
			});
			expect(describe_scaling_policy_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg'
			});
			expect(describe_hooks_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg'
			});
			expect(describe_vpcs_spy).to.have.been.calledWith({
				Filters: [
					{
						Name: 'tag:Name',
						Values: ['fake-vpc']
					}
				]
			});
			expect(describe_subnets_spy).to.have.been.calledWith({
				Filters: [
					{
						Name: 'vpc-id',
						Values: ['fake-vpc-id']
					}
				]
			});
			expect(create_asg_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg',
				LaunchConfigurationName: 'fake-new-lc',
				VPCZoneIdentifier: 'fake-subnet-1,fake-subnet-2',
				TerminationPolicies: ['ClosestToNextInstanceHour'],
				MinSize: 0,
				MaxSize: 2,
				DesiredCapacity: 1,
				HealthCheckGracePeriod: 60,
				Tags: [
					{
						Key: 'Name',
						Value: 'fake-name'
					}
				],
				HealthCheckType: 'ELB',
				LoadBalancerNames: ['fake-elb1'],
				TargetGroupARNs: ['fake-tg-arn']
			});
			expect(put_notifcation_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg',
				NotificationTypes: ['autoscaling:EC2_INSTANCE_LAUNCH_ERROR', 'autoscaling:EC2_INSTANCE_TERMINATE_ERROR'],
				TopicARN: `arn:aws:sns:us-east-1:fake-account-id:fake-err-topic`
			});
			expect(put_sched_action_spy).to.have.been.calledWith({
					AutoScalingGroupName: 'fake-new-asg',
					ScheduledActionName: 'fake-sched-action-1',
					DesiredCapacity: 10,
					Recurrence: 'fake-recurrence'
			});
			expect(put_scaling_policy_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg',
				PolicyName: 'fake-scaling-policy-1',
				AdjustmentType: 'ChangeInCapacity',
				ScalingAdjustment: 2,
				Cooldown: 1200
			});
			expect(put_scaling_policy_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg',
				PolicyName: 'fake-scaling-policy-2',
				AdjustmentType: 'ChangeInCapacity',
				PolicyType: 'StepScaling',
				MetricAggregationType: 'Maximum',
				StepAdjustments: [
					{
						MetricIntervalLowerBound: 0,
						MetricIntervalUpperBound: 100,
						ScalingAdjustment: 1
					},
					{
						MetricIntervalLowerBound: 100,
						MetricIntervalUpperBound: 200,
						ScalingAdjustment: 2
					},
					{
						MetricIntervalLowerBound: 200,
						MetricIntervalUpperBound: undefined,
						ScalingAdjustment: 3
					}
				]
			});
			expect(describe_alarms_spy).to.have.been.calledWith({
				AlarmNames: ['fake-alarm-1']
			});
			expect(put_alarm_spy).to.have.been.calledWith({
				AlarmName: 'fake-alarm-1',
				MetricName: 'fake-metric-name-1',
				Namespace: 'fake-metric-namespace-1',
				Statistic: 'fake-statistic-1',
				Period: 300,
				Threshold: 1000,
				ComparisonOperator: 'fake-comp-operator-1',
				Dimensions: [{Name: 'QueueName', Value: 'fake-queue-1'}],
				EvaluationPeriods: 1,
				AlarmActions: ['fake-policy-arn-2']
			});
			expect(enable_metrics_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg',
				Granularity: '1Minute'
			});
			expect(put_hook_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg', /* required */
				LifecycleHookName: 'fake-hook-name', /* required */
				DefaultResult: 'ABANDON',
				HeartbeatTimeout: 1800,
				LifecycleTransition: 'autoscaling:EC2_INSTANCE_TERMINATING',
				NotificationTargetARN: 'fake-target-arn',
				RoleARN: 'fake-role-arn'
			});
			expect(update_asg_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg',
				DesiredCapacity: 0,
				MinSize: 0
			});
			expect(del_sched_act_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg',
				ScheduledActionName: 'fake-sched-action-1'
			});
			expect(del_policy_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg',
				PolicyName: 'fake-scaling-policy-1'
			});
			expect(del_policy_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg',
				PolicyName: 'fake-scaling-policy-2'
			});
			//TODO let old asg go down to 0 instances...
			expect(delete_asg_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg'
			});

			expect(desc_inst_health_spy).to.have.been.calledWith({
				LoadBalancerName: 'fake-elb1',
			});
			expect(desc_target_health_spy).to.have.been.calledWith({
				TargetGroupArn: 'fake-tg-arn'
			});

		});
	});

});
