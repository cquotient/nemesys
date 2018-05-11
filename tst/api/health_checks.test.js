'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../src/api/aws_provider');
const health_checks = require('../../src/api/health_checks');

describe('health checks', function () {
	let sandbox,
		mock_ec2,
		mock_elb;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();

		mock_ec2 = {
			waitForAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: '123',
									State: {
										Name: 'running'
									}
								}
							]
						}
					]
				})
			),
			describeInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: 'fake-instance-id-1',
									Tags: [
										{
											Key: 'Spinup',
											Value: 'complete'
										}
									]
								}
							]
						}
					]
				})
			)
		};

		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);

		mock_elb = {
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

		sandbox.stub(AWSProvider, 'get_elb', () => mock_elb);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('wait for status calls waitForAsync', function () {
		return health_checks
			.wait_until_status('us-east-1', '123', 'instanceExists')
			.then(function (result) {
				expect(mock_ec2.waitForAsync.calledWith('instanceExists', {
					InstanceIds: ['123']
				})).to.be.true;

				expect(result).eql('123');
			});
	});

	it('wait until healhty calls waitForAsync', function () {
		return health_checks
			.wait_until_healthy('us-east-1', 'lbname', '123')
			.then(function () {
				expect(mock_elb.waitForAsync).to.have.been.calledWith(
					'instanceInService',
					{
						LoadBalancerName: 'lbname',
						Instances: [
							{
								InstanceId: '123'
							}
						]
					}
				);
			});
	});

	it('wait for spinup calls describeInstancesAsync', function () {
		return health_checks
			.wait_for_spinup_complete('us-east-1', 'fake-instance-id-1')
			.then(function () {
				expect(mock_ec2.describeInstancesAsync).to.have.been.calledWith({
					InstanceIds: ['fake-instance-id-1']
				});
			});
	});
});
