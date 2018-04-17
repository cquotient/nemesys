'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

describe('instance create', function () {
	let sandbox, mock_ec2, expected_run_args;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();
		sandbox.stub(AWSUtil, 'get_ami_id', (region, ami_name) => Promise.resolve(
			ami_name
		));
		sandbox.stub(AWSUtil, 'get_userdata_string', (ud_files, env_vars, raw_ud_string) => Promise.resolve(
			'userdata_string'
		));
		sandbox.stub(AWSUtil, 'get_network_interface', (region, vpc, az, eni_name, sg) => Promise.resolve(
			eni_name
		));

		mock_ec2 = {
			runInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Instances: [
						{InstanceId: '123'}
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
				Name: 'iam'
			},
			BlockDeviceMappings: null,
			KeyName: null,
			InstanceType: null,
			EbsOptimized: false,
			NetworkInterfaces: ['fake-network-interface-id'],
			UserData: new Buffer('userdata_string').toString('base64')
		};
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('should create an instance', function () {
		return instance
			.create(['us-east-1'], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync.calledWith(expected_run_args)).to.be.true;

				expect(mock_ec2.describeInstancesAsync.calledWith({
					InstanceIds: ['123']
				})).to.be.true;

				expect(result).eql(['123']);
			});
	});

});
