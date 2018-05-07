'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');

describe('instance create', function () {
	let sandbox, mock_ec2, expected_run_args;
	let alloc_id = 'aloc123';
	let assoc_id = 'assoc123';
	let pub_ip = '999.999.999.999';
	let instance_id = '123';

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
						{InstanceId: instance_id}
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
			createTagsAsync: sandbox.stub().returns(
				Promise.resolve({})
			),
			waitForAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: instance_id,
									State: {
										Name: 'running'
									}
								}
							]
						}
					]
				})
			),
			describeAddressesAsync: sandbox.stub().returns(
				Promise.resolve({
					Addresses: [{
						AllocationId: alloc_id,
						AssociationId: assoc_id
					}]
				})
			),
			disassociateAddressAsync: sandbox.stub().returns(
				Promise.resolve()
			),
			associateAddressAsync: sandbox.stub().returns(
				Promise.resolve()
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

	it('creates an instance with no elastic ip', function () {
		return instance
			.create(['us-east-1'], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null, null)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(mock_ec2.waitForAsync).to.have.been.calledWith('instanceExists', {
						InstanceIds: [instance_id]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.not.been.called;

				expect(mock_ec2.disassociateAddressAsync).to.have.not.been.called;

				expect(mock_ec2.associateAddressAsync).to.have.not.been.called;

				expect(result).eql([instance_id]);
			});
	});

	it('creates an instance with an elastic ip when detaching and attaching succeeds', function () {
		return instance
			.create(['us-east-1'], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null, pub_ip)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(mock_ec2.waitForAsync).to.be.calledWith('instanceExists', {
						InstanceIds: [instance_id]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.have.been.calledWith({
					AssociationId: assoc_id
				});

				expect(mock_ec2.associateAddressAsync).to.have.been.calledWith({
					AllocationId: alloc_id,
					InstanceId: instance_id
				});

				expect(result).eql([instance_id]);
			});
	});

	it('creates an instance with an elastic ip when nothing to detach and attaching succeeds', function () {
		mock_ec2.describeAddressesAsync = sandbox.stub().returns(
			Promise.resolve({
				Addresses: [{
					AllocationId: alloc_id,
					AssociationId: null
				}]
			})
		);
		return instance
			.create(['us-east-1'], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null, pub_ip)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(mock_ec2.waitForAsync).to.be.calledWith('instanceExists', {
						InstanceIds: [instance_id]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.have.not.been.called;

				expect(mock_ec2.associateAddressAsync).to.have.been.calledWith({
					AllocationId: alloc_id,
					InstanceId: instance_id
				});

				expect(result).eql([instance_id]);
			});
	});

	it('does not create an instance when attaching an EIP fails due to AWS error (or otherwise)', function () {
		let expected_err = new Error('Something wrong');
		mock_ec2.associateAddressAsync = sandbox.stub().returns(
			Promise.reject(expected_err)
		);
		return instance
			.create(['us-east-1'], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null, pub_ip)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(mock_ec2.waitForAsync).to.be.calledWith('instanceExists', {
						InstanceIds: [instance_id]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.have.been.calledWith({
					AssociationId: assoc_id
				});

				expect(mock_ec2.associateAddressAsync).to.have.been.calledWith({
					AllocationId: alloc_id,
					InstanceId: instance_id
				});

				expect(result).eql([instance_id]);
			})
			.catch(err => {
				expect(err).to.eql(expected_err);
			});
	});
});
