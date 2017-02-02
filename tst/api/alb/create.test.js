'use strict';

const chai = require('chai');
const sinon = require('sinon');
chai.use(require('sinon-chai'));
const expect = chai.expect;

describe('create ami', function(){
	let testee, sandbox, regions, vpc_name, vpc_id, sg_name, sg_id, subnet_ids, lb_name, target_groups, mock_elb,
		mock_ec2, ssl_config, options;

	before(function(){
		testee = require('../../../src/api/alb/create');
	});

	beforeEach(function(){
		sandbox = require('sinon').sandbox.create();
	});

	afterEach(function(){
		sandbox.restore();
	});

	beforeEach(function(){
		regions = [ 'zz-southnorth-82' ];
		vpc_name = 'my_vpc';
		vpc_id = 'vpc-1234';
		sg_name = 'my_sg';
		sg_id = 'sg-44556';
		subnet_ids = [ 'subnet-123', 'subnet-456' ];
		lb_name = 'my_alb';
		target_groups = [
			{ name: 'my_target', port: 443 }
		];
		ssl_config = {};
		options = {};

		mock_elb = {
			createLoadBalancerAsync: sinon.stub().returns(Promise.resolve({
				LoadBalancers: [
					{},
				]
			})),
			registerTargetsAsync:sinon.stub().returns(Promise.resolve()),
			createRuleAsync: sinon.stub().returns(Promise.resolve()),
			createListenerAsync: sinon.stub().returns(Promise.resolve()),
			createTargetGroupAsync: sinon.stub().returns(Promise.resolve({
				TargetGroups: [ { TargetGroupArn: 'tg_arn' } ],
			})),
		};

		mock_ec2 = {
			describeInstancesAsync: sinon.stub().returns(Promise.resolve({
				Reservations: [
					{
						Instances: [{ InstanceId: 'i-pizzaheaven' }]
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

	it('creates LB without targets', function () {
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				expect(mock_elb.createLoadBalancerAsync.callCount).to.equal(1);
				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(1);
				expect(mock_elb.createListenerAsync.callCount).to.equal(2);
				expect(mock_elb.registerTargetsAsync.callCount).to.equal(0);
			});
	});

	it('creates LB with instance id targets', function () {
		target_groups = [
			{
				name: 'my_target', port: 443,
				targets: [
					{ instance_id: 'i-1234567abcd', port: 3333 },
					{ instance_id: 'i-pizzaplanet', port: 4433 },
				]
			}
		];
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				expect(mock_elb.createLoadBalancerAsync.callCount).to.equal(1);
				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(1);
				expect(mock_elb.createListenerAsync.callCount).to.equal(2);
				expect(mock_elb.registerTargetsAsync.callCount).to.equal(1);
			});
	});

	it('creates LB with instance name targets', function () {
		target_groups = [
			{
				name: 'my_target', port: 443,
				targets: [
					{ instance_name: 'my_fav-instances', port: 3333 },
				]
			}
		];
		return testee(regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options)
			.then(() => {
				expect(mock_elb.createLoadBalancerAsync.callCount).to.equal(1);
				expect(mock_elb.createTargetGroupAsync.callCount).to.equal(1);
				expect(mock_elb.createListenerAsync.callCount).to.equal(2);
				expect(mock_elb.registerTargetsAsync.callCount).to.equal(1);
			});
	});
});
