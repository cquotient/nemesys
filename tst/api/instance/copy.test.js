'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

const mock_ec2 = {
	runInstancesAsync: function (params) {
		expect(params).to.eql({
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
		});

		return Promise.resolve({
			Instances: [
				{InstanceId: '456'}
			]
		});
	},
	describeInstancesAsync: function (params) {
		expect(params).to.eql({
			InstanceIds: ['123']
		});

		return Promise.resolve({
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
		});
	},
	describeInstanceAttributeAsync: function (params) {
		expect(params).to.eql({
			Attribute: 'userData',
			InstanceId: '123'
		});

		return Promise.resolve({
			UserData: {
				Value: 'user_data'
			}
		});
	},
	describeVolumesAsync: function (params) {
		expect(params).to.eql({
			Filters: [
				{
					Name: "attachment.instance-id",
					Values: ['123']
				}
			]
		});
		return Promise.resolve({Volumes: []});
	}
};

describe('instance copy', function () {
	let sandbox;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		sandbox.stub(AWSUtil, 'get_instance_by_name', () => Promise.resolve({
			InstanceId: '123'
		}));
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('should copy an existing instance', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance')
			.then(function (result) {
				expect(result).eql(['456']);
			});
	});
});
