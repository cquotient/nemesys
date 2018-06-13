'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');


describe('instance replace', function () {
	let sandbox, mock_elb, mock_ec2;
	let old_instance_id = '456';
	let new_instance_id = '123';

	beforeEach(function () {
		sandbox = sinon.createSandbox();

		mock_elb = {
			registerInstancesWithLoadBalancerAsync: sandbox.stub().returns(Promise.resolve({})),
			deregisterInstancesFromLoadBalancerAsync: sandbox.stub().returns(Promise.resolve({})),
			describeLoadBalancersAsync: sandbox.stub().returns(
				Promise.resolve({
					LoadBalancerDescriptions: [
						{
							LoadBalancerName: 'lb',
							Instances: [
								{InstanceId: '456'}
							]
						}
					]
				})
			),
			waitForAsync: sandbox.stub().returns(
				Promise.resolve({
					InstanceStates: [
						{
							State: 'InService'
						}
					]
				})
			)
		};

		mock_ec2 = {
			terminateInstancesAsync: sandbox.stub().returns(
				Promise.resolve()
			)
		};

		sandbox.stub(AWSProvider, 'get_elb').returns(mock_elb);
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);
		sandbox.stub(AWSUtil, 'get_instance_by_name').callsFake((region, name) => {
			if (name === 'old-instance') {
				return Promise.resolve({
					InstanceId: old_instance_id
				});
			} else if (name === 'new-instance') {
				return Promise.resolve({
					InstanceId: new_instance_id
				});
			}
			return Promise.resolve();
		});
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('replaces an instance', function () {
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance')
			.then(function () {
				expect(mock_elb.registerInstancesWithLoadBalancerAsync).to.have.been.calledWith({
					Instances: [{InstanceId: new_instance_id}],
					LoadBalancerName: 'lb'
				});

				expect(mock_elb.deregisterInstancesFromLoadBalancerAsync).to.have.been.calledWith({
					Instances: [{InstanceId: old_instance_id}],
					LoadBalancerName: 'lb'
				});

				expect(mock_elb.waitForAsync).to.have.been.calledWith(
					'instanceInService',
					{
						LoadBalancerName: 'lb',
						Instances: [
							{
								InstanceId: new_instance_id
							}
						]
					}
				);
			});
	});
});
