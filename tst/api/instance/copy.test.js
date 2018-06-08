'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

describe('instance copy', function () {
	let sandbox, mock_ec2, expected_run_args;

	beforeEach(function () {
		sandbox = sinon.createSandbox();
		sandbox.stub(AWSUtil, 'get_instance_by_name').returns(Promise.resolve({InstanceId: '123'}));
		sandbox.stub(AWSUtil, 'get_ami_id').callsFake((region, ami_name) => Promise.resolve(
			ami_name
		));

		mock_ec2 = {
			runInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Instances: [
						{InstanceId: '456'}
					]
				})
			),
			describeVpcsAsync: sandbox.stub().returns(
				Promise.resolve({
					Vpcs: [
						{
							VpcId: 'fake-vpc-id'
						}
					]
				})
			),
			describeSubnetsAsync: sandbox.stub().returns(
				Promise.resolve({
					Subnets: [
						{
							SubnetId: 'fake-subnet-1'
						},
						{
							SubnetId: 'fake-subnet-2'
						}
					]
				})
			),
			describeSecurityGroupsAsync: sandbox.stub().returns(
				Promise.resolve({
					"SecurityGroups": [
						{
							GroupId: 'fake-sg-id'
						}
					]
				})
			),
			describeNetworkInterfacesAsync: sandbox.stub().returns(
				Promise.resolve({
					"NetworkInterfaces": [
						{
							NetworkInterfaceId: 'fake-network-interface-id'
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
		expected_run_args = {
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
		};
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('should copy an existing instance', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance')
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync.calledWith(expected_run_args)).to.be.true;

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

	it('should copy an existing instance and override the instance type', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', null, null, 'other_type')
			.then(function (result) {
				let expected = expected_run_args;
				expected.InstanceType = 'other_type';
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;
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

	it('should copy an existing instance and override the instance type and ami', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', null, 'fancy_ami', 'other_type')
			.then(function (result) {
				let expected = expected_run_args;
				expected.InstanceType = 'other_type';
				expected.ImageId = 'fancy_ami';
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;

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

	it('should copy an existing instance and override the instance type and ami', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', null, 'fancy_ami', 'other_type')
			.then(function (result) {
				let expected = expected_run_args;
				expected.InstanceType = 'other_type';
				expected.ImageId = 'fancy_ami';
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;

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

	it('should copy an existing instance and disable ebs optimization on the copy', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', null, null, null, null, null, null, null, null, null, null, null, null, null, null, false)
			.then(function (result) {
				let expected = expected_run_args;
				expected.EbsOptimized = false;
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;

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

	it('should copy an existing instance and use the provided tags', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', null, null, null, null, null, null, null, null, null, null, null, ['Tag=overridden-tag'], null, null, null)
			.then(function (result) {
				let expected = expected_run_args;
				expected.TagSpecifications = [
					{
						ResourceType: 'instance',
						Tags: [
							{
								Key: 'Name',
								Value: 'new-instance'
							},
							{
								Key: 'Tag',
								Value: 'overridden-tag'
							}
						]
					}
				];
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;

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

	it('should copy an existing instance but use the provided ENI', function () {
		return instance
			.copy(['us-east-1'], 'old-instance', 'new-instance', 'fake-vpc-id', null, null, null, ['fake-sg-id'], null, null, null, null, null, null, null, 'fake-network-interface-id', null, null)
			.then(function (result) {
				let expected = expected_run_args;
				expected.NetworkInterfaces = {
					DeviceIndex: 0,
					NetworkInterfaceId: 'fake-network-interface-id'
				};
				expect(mock_ec2.runInstancesAsync.calledWith(expected)).to.be.true;

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
