'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

const mock_elb = {
	registerInstancesWithLoadBalancerAsync: function (params) {
		expect(params).to.eql({
			Instances: [{InstanceId: '123'}],
			LoadBalancerName: 'lb'
		});

		return Promise.resolve({});
	},
	deregisterInstancesFromLoadBalancerAsync: function (params) {
		expect(params).to.eql({
			Instances: [{InstanceId: '456'}],
			LoadBalancerName: 'lb'
		});

		return Promise.resolve({});
	},
	describeLoadBalancersAsync: function () {
		return Promise.resolve({
			LoadBalancerDescriptions: [
				{
					LoadBalancerName: 'lb',
					Instances: [
						{InstanceId: '456'}
					]
				}
			]
		});
	},
	describeInstanceHealthAsync: function () {
		return Promise.resolve({
			InstanceStates: [
				{State: 'InService'}
			]
		});
	}
};

const mock_ec2 = {
	terminateInstancesAsync: function () {
		return Promise.resolve();
	}
};

describe('instance replace', function () {
	let sandbox;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();
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
		return instance.replace('us-east-1', 'old-instance', 'new-instance');
	});
});
