'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');


describe('instance replace', function () {
	let sandbox, mock_elb, mock_ec2;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();

		mock_elb = {
			registerInstancesWithLoadBalancerAsync: sandbox.stub().returns(
				Promise.resolve({})
			),
			deregisterInstancesFromLoadBalancerAsync: sandbox.stub().returns(
				Promise.resolve({})
			),
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

		sandbox.stub(AWSProvider, 'get_elb', () => mock_elb);
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		sandbox.stub(AWSUtil, 'get_instance_by_name', (region, name) => {
			if (name === 'old-instance') {
				return Promise.resolve({
					InstanceId: '456'
				});
			} else if (name === 'new-instance') {
				return Promise.resolve({
					InstanceId: '123'
				});
			}
			return Promise.resolve();
		});
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('should replace an instance', function () {
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance')
			.then(function () {
				expect(mock_elb.registerInstancesWithLoadBalancerAsync.calledWith({
					Instances: [{InstanceId: '123'}],
					LoadBalancerName: 'lb'
				})).to.be.true;

				expect(mock_elb.deregisterInstancesFromLoadBalancerAsync.calledWith({
					Instances: [{InstanceId: '456'}],
					LoadBalancerName: 'lb'
				})).to.be.true;

				expect(mock_elb.waitForAsync.calledWith(
					'instanceInService',
					{
						LoadBalancerName: 'lb',
						Instances: [
							{
								InstanceId: '123'
							}
						]
					}
				)).to.be.true;
			});
	});
});
