'use strict';

const chai = require('chai');
const sinon = require('sinon');
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('create alb', function () {
	let testee, sandbox, regions, vpc_name, vpc_id, sg_name, sg_id, subnet_ids, lb_name, target_groups, mock_elb,
		mock_ec2, ssl_config, options, mock_instances;

	before(function () {
		testee = require('../../../src/api/alb/create');
	});

	beforeEach(function () {
		sandbox = require('sinon').createSandbox();
	});

	afterEach(function () {
		sandbox.restore();
	});

	beforeEach(function () {
		regions = ['zz-southnorth-82'];
		vpc_name = 'my_vpc';
		vpc_id = 'vpc-1234';
		sg_name = 'my_sg';
		sg_id = 'sg-44556';
		subnet_ids = ['subnet-123', 'subnet-456'];
		lb_name = 'my_alb';
		target_groups = [
			{name: 'my_target', port: 443}
		];
		ssl_config = {
			policy: 'ssl_pol',
			cert: 'ssl_cert1',
		};
		options = {};
		mock_instances = [{InstanceId: 'i-pizzaheaven'}, {InstanceId: 'i-hambugerhell'}];

		mock_elb = {
			createLoadBalancerAsync: sinon.stub().returns(Promise.resolve({
				LoadBalancers: [
					{ LoadBalancerArn: 'lb_arn' },
				]
			})),
			registerTargetsAsync:    sinon.stub().returns(Promise.resolve()),
			createRuleAsync:         sinon.stub().returns(Promise.resolve()),
			createListenerAsync:     sinon.stub().returns(Promise.resolve({
				Listeners: [{ListenerArn: 'list_arn'}],
			})),
			createTargetGroupAsync:  sinon.stub().returns(Promise.resolve({
				TargetGroups: [{TargetGroupArn: 'tg_arn'}],
			})),
		};

		mock_ec2 = {
			describeInstancesAsync: sinon.stub().returns(Promise.resolve({
				Reservations: [
					{
						Instances: mock_instances
					}
				]
			}))
		};

		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_elbv2').returns(mock_elb);
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);

		let AWSUtils = require('../../../src/api/aws_util');
		sandbox.stub(AWSUtils, 'get_vpc_id').returns(vpc_id);
		sandbox.stub(AWSUtils, 'get_sg_id').returns(sg_id);
		sandbox.stub(AWSUtils, 'get_subnet_ids').returns(subnet_ids);

	});

	function check_create_lb_call () {
		expect(mock_elb.createLoadBalancerAsync.callCount).to.equal(1);
		expect(mock_elb.createLoadBalancerAsync).to.have.been.calledWith(
			{
				IpAddressType:  'ipv4',
				Name:           'my_alb',
				Scheme:         'internet-facing',
				SecurityGroups: [sg_id],
				Subnets:        subnet_ids
			}
		);
	}


	function check_create_target_group (parts_to_check) {
		let base_args = {
			Protocol:                   'HTTP',
			VpcId:                      'vpc-1234',
			HealthCheckIntervalSeconds: 30,
			HealthCheckPath:            '/pulse',
			HealthCheckPort:            '1111',
			HealthCheckProtocol:        'HTTP',
			HealthCheckTimeoutSeconds:  5,
			HealthyThresholdCount:      2,
			UnhealthyThresholdCount:    2
		};
		expect(mock_elb.createTargetGroupAsync).to.have.been.calledWith(
			Object.assign({}, base_args, parts_to_check)
		);
	}

	function check_create_listener () {
		expect(mock_elb.createListenerAsync.callCount).to.equal(2);
		expect(mock_elb.createListenerAsync).to.have.been.calledWith({
			DefaultActions:  [{
				TargetGroupArn: 'tg_arn',
				Type:           'forward',
			}],
			LoadBalancerArn: 'lb_arn',
			Port:            80,
			Protocol:        'HTTP'
		});
		expect(mock_elb.createListenerAsync).to.have.been.calledWith({
			DefaultActions:  [{
				TargetGroupArn: 'tg_arn',
				Type:           'forward',
			}],
			LoadBalancerArn: 'lb_arn',
			Port:            443,
			Protocol:        'HTTPS',
			SslPolicy:       'ssl_pol',
			Certificates:    [{CertificateArn: 'ssl_cert1'}]
		});
	}

	function check_register_target (ids, port) {
		expect(mock_elb.registerTargetsAsync).to.have.been.calledWith({
			TargetGroupArn: 'tg_arn',
			Targets:        ids.map((id) => ({ Id: id, Port: port }))
		});
	}

	it('creates LB without targets', function () {
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				check_create_lb_call();

				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(target_groups.length);
				check_create_target_group({
					Name: 'my_target',
					Port: 443,
					HealthCheckPort: '443',
				});

				expect(mock_elb.createListenerAsync.callCount).to.equal(2);
				expect(mock_elb.registerTargetsAsync.callCount).to.equal(0);
			});
	});

	it('creates LB with instance id targets', function () {
		target_groups = [
			{
				name:    'my_target', port: 443,
				targets: [
					{instance_id: 'i-1234567abcd', port: 3333},
					{instance_id: 'i-pizzaplanet', port: 3333},
				]
			}
		];
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				check_create_lb_call();

				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(target_groups.length);
				check_create_target_group({
					Name: 'my_target',
					Port: 443,
					HealthCheckPort: '443',
				});

				expect(mock_elb.createListenerAsync.callCount).to.equal(2);

				expect(mock_elb.registerTargetsAsync.callCount).to.equal(1);
				check_register_target(['i-1234567abcd', 'i-pizzaplanet'], 3333);
			});
	});

	it('creates LB with instance name targets', function () {
		target_groups = [
			{
				name:    'my_target', port: 443,
				targets: [
					{instance_name: 'my_fav-instances', port: 3333},
				]
			}
		];
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				check_create_lb_call();

				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(target_groups.length);
				check_create_target_group({
					Name: 'my_target',
					Port: 443,
					HealthCheckPort: '443',
				});

				check_register_target([mock_instances[0].InstanceId, mock_instances[1].InstanceId], 3333);

				expect(mock_elb.registerTargetsAsync.callCount).to.equal(1);
			});
	});

	it('creates rules with multiple target groups', function () {
		target_groups = [
			{
				name:    'my_target', port: 1111,
				targets: [
					{ instance_name: 'my_fav-instances', port: 4444 },
				]
			},
			{
				name:    'my_rule1', port: 2222,
				targets: [
					{ instance_name: 'my_ruled-instances', port: 3333 },
				]
			},
			{
				name: 'my_rule2', port: 2222,
			},
		];
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				check_create_lb_call();

				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(target_groups.length);
				check_create_target_group({
					Name: 'my_target',
					Port: 1111,
					HealthCheckPort: '1111',
				});
				check_create_target_group({
					Name: 'my_rule1',
					Port: 2222,
					HealthCheckPort: '2222',
				});
				check_create_target_group({
					Name: 'my_rule2',
					Port: 2222,
					HealthCheckPort: '2222',
				});
				check_create_listener();

				expect(mock_elb.registerTargetsAsync.callCount).to.equal(2);
				check_register_target([mock_instances[0].InstanceId, mock_instances[1].InstanceId], 3333);
				check_register_target([mock_instances[0].InstanceId, mock_instances[1].InstanceId], 4444);

				expect(mock_elb.createRuleAsync.callCount).to.equal((target_groups.length - 1) * 2);
			});
	});
});
