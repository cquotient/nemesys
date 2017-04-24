'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

describe('instance copy', function () {
	let sandbox, mock_ec2;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();
		sandbox.stub(AWSUtil, 'get_instance_by_name', () => Promise.resolve({
			InstanceId: '123'
		}));

		mock_ec2 = {
			runInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Instances: [
						{InstanceId: '456'}
					]
				})
			),
			describeInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									ImageId: 'image_id',
									IamInstanceProfile: {
										Arn: 'arn'
									},
									BlockDeviceMappings: [],
									Placement: {},
									KeyName: 'key_name',
									Tags: [],
									InstanceType: 'instance_type',
									EbsOptimized: true,
									NetworkInterfaces: []
								}
							]
						}
					]
				})
			),
			describeInstanceAttributeAsync: sandbox.stub().returns(
				Promise.resolve({
					UserData: {
						Value: 'user_data'
					}
				})
			),
			describeVolumesAsync: sandbox.stub().returns(
				Promise.resolve({Volumes: []})
			),
			waitForAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: '456',
									State: {
										Name: 'running'
									}
								}
							]
						}
					]
				})
			)
		};

		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('should copy an existing instance', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance')
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync.calledWith({
					MaxCount: 1,
					MinCount: 1,
					Monitoring: {
						Enabled: true
					},
					ImageId: 'image_id',
					IamInstanceProfile: {
						Arn: 'arn'
					},
					BlockDeviceMappings: [],
					Placement: {},
					KeyName: 'key_name',
					TagSpecifications: [
						{
							ResourceType: 'instance',
							Tags: [
								{
									Key: 'Name',
									Value: 'new-instance'
								}
							]
						}
					],
					InstanceType: 'instance_type',
					EbsOptimized: true,
					NetworkInterfaces: [],
					UserData: 'user_data'
				})).to.be.true;

				expect(mock_ec2.describeInstancesAsync.calledWith({
					InstanceIds: ['123']
				})).to.be.true;

				expect(mock_ec2.describeInstanceAttributeAsync.calledWith({
					Attribute: 'userData',
					InstanceId: '123'
				})).to.be.true;

				expect(mock_ec2.describeVolumesAsync.calledWith({
					Filters: [
						{
							Name: "attachment.instance-id",
							Values: ['123']
						}
					]
				})).to.be.true;

				expect(mock_ec2.waitForAsync.calledWith(
					'instanceRunning',
					{InstanceIds: ['456']}
				)).to.be.true;

				expect(result).eql(['456']);
			});
	});
});
