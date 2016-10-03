'use strict';

describe('replace asg', function(){
	var replace,
			sandbox,
			chai,
			sinon_chai,
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
			describe_vpcs_spy,
			describe_subnets_spy;

	before(function(){
		replace = require('../../../src/api/asg/replace');
		chai = require('chai');
		sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		sandbox = require('sinon').sandbox.create();
		const mock_as = {
			describeAutoScalingGroupsAsync: function(params){
				if(params.AutoScalingGroupNames
				&& params.AutoScalingGroupNames.length === 1) {
					let name = params.AutoScalingGroupNames[0];
					if(name === 'fake-new-asg') {
						var instances = [{
							LifecycleState: 'InService',
							HealthStatus: 'Healthy'
						}];
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
									LoadBalancerNames: [
										'fake-elb1'
									],
									TargetGroupARNs: [
										'fake-target-arn'
									],
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
									LoadBalancerNames: [
										'fake-elb1'
									],
									TargetGroupARNs: [
										'fake-target-arn'
									],
									HealthCheckType: 'elb',
									HealthCheckGracePeriod: 60,
									Instances: [],
									Tags: [
										{
											Key: 'Name',
											Value: 'fake-name'
										}
									]
								}
							]
						});
					}
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
							MetricAggregationType: 'Average',
							Alarms: [
								{
									AlarmName: 'fake-alarm-1',
									AlarmARN: 'fake-alarm-arn-1'
								}
							]
						}
					]
				});
			},
			createAutoScalingGroupAsync: function(params){

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
				return Promise.resolve({});
			},
			enableMetricsCollectionAsync: function(params){
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
		var AWSProvider = require('../../../src/api/aws_provider');
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
				LoadBalancerNames: ['fake-elb1']
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
			// expect(put_scaling_policy_spy).to.have.been.calledWith({
			// 	AutoScalingGroupName: 'fake-new-asg',
			// 	PolicyName: 'fake-scaling-policy-1',
			// 	PolicyType: 'SimpleScaling',
			// 	AdjustmentType: 'ChangeInCapacity',
			// 	ScalingAdjustment: 2,
			// 	Cooldown: 1200,
			// 	MetricAggregationType: 'Average'
			// });
			expect(enable_metrics_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-new-asg'
			});
			expect(update_asg_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg',
				DesiredCapacity: 0
			});
			//TODO let old asg go down to 0 instances...
			expect(delete_asg_spy).to.have.been.calledWith({
				AutoScalingGroupName: 'fake-old-asg'
			});
		});
	});

});
