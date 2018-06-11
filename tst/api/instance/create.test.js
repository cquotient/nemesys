'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');
const health_check = require('../../../src/api/health_checks');

describe('instance create', function () {
	let sandbox, mock_ec2, expected_run_args;
	let region, tag, tag_key, alloc_id, assoc_id, pub_ip, instance_id;

	beforeEach(function () {
		region = 'us-east-1';
		tag = 'tag1=val1';
		tag_key = {Key: 'tag1', Value: 'val1'};
		alloc_id = 'aloc123';
		assoc_id = 'assoc123';
		pub_ip = '999.999.999.999';
		instance_id = '123';

		sandbox = sinon.createSandbox();
		sandbox.stub(AWSUtil, 'get_ami_id').callsFake((region, ami_name) => Promise.resolve(
			ami_name
		));
		sandbox.stub(AWSUtil, 'get_userdata_string').callsFake((ud_files, env_vars, raw_ud_string) => Promise.resolve(
			'userdata_string'
		));
		sandbox.stub(AWSUtil, 'get_network_interface').callsFake((region, vpc, az, eni_name, sg) => Promise.resolve(
			eni_name
		));

		sandbox.stub(health_check, 'wait_until_status').returns(Promise.resolve(instance_id));
		sandbox.stub(health_check, 'wait_for_spinup_complete').returns(Promise.resolve(instance_id));

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
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('creates an instance with no elastic ip', function () {
		return instance
			.create([region], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], null, 'fake-network-interface-id', null, null, [], false)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(health_check.wait_until_status).to.have.been.calledWith(region, instance_id, 'instanceExists');

				expect(health_check.wait_for_spinup_complete).to.have.not.been.called;

				expect(mock_ec2.describeAddressesAsync).to.have.not.been.called;

				expect(mock_ec2.disassociateAddressAsync).to.have.not.been.called;

				expect(mock_ec2.associateAddressAsync).to.have.not.been.called;

				expect(result).eql([instance_id]);
			});
	});

	it('creates an instance with an elastic ip when reassociate is true, and detaching and attaching succeeds', function () {
		return instance
			.create([region], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], [tag], 'fake-network-interface-id', null, null, [pub_ip], true)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(health_check.wait_until_status).to.have.been.calledWith(region, instance_id, 'instanceExists');

				expect(mock_ec2.createTagsAsync).to.be.calledWith({
					Resources: [instance_id],
					Tags: [tag_key]
				});

				expect(health_check.wait_for_spinup_complete).to.have.been.calledWith(region, instance_id);

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

	it('creates an instance without an elastic IP when reassociate is false and an EIP is already attached', function () {
		return instance
			.create([region], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], [tag], 'fake-network-interface-id', null, null, [pub_ip], false)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(health_check.wait_until_status).to.have.been.calledWith(region, instance_id, 'instanceExists');

				expect(mock_ec2.createTagsAsync).to.have.been.calledWith({
					Resources: [instance_id],
					Tags: [tag_key]
				});

				expect(health_check.wait_for_spinup_complete).to.have.not.been.called;

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.have.not.been.called;

				expect(mock_ec2.associateAddressAsync).to.have.not.been.called;

				expect(result).eql([instance_id]);
			});
	});

	it('creates an instance with an elastic ip when reassociate is true, nothing to detach, and attaching succeeds', function () {
		mock_ec2.describeAddressesAsync = sandbox.stub().returns(
			Promise.resolve({
				Addresses: [{
					AllocationId: alloc_id,
					AssociationId: null
				}]
			})
		);
		return instance
			.create([region], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], [tag], 'fake-network-interface-id', null, null, [pub_ip], false)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(health_check.wait_until_status).to.have.been.calledWith(region, instance_id, 'instanceExists');

				expect(mock_ec2.createTagsAsync).to.have.been.calledWith({
					Resources: [instance_id],
					Tags: [tag_key]
				});

				expect(health_check.wait_for_spinup_complete).to.have.not.been.called;

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

	it('does not attach an EIP when creating tags fails due to AWS error (or other fatal error) and throws an exception', function () {
		let expected_err = new Error('Something wrong');
		mock_ec2.createTagsAsync = sandbox.stub().returns(
			Promise.reject(expected_err)
		);
		return instance
			.create([region], null, 'image_id', null, null, null, 'iam', null, null, null, null, ['e'], [tag], 'fake-network-interface-id', null, null, [pub_ip], true)
			.then(function (result) {
				expect(mock_ec2.runInstancesAsync).to.have.been.calledWith(expected_run_args);

				expect(health_check.wait_until_status).to.have.been.calledWith(region, instance_id, 'instanceExists');

				expect(mock_ec2.createTagsAsync).to.have.been.calledWith({
					Resources: [instance_id],
					Tags: [tag_key]
				});

				expect(health_check.wait_for_spinup_complete).to.have.not.been.called;

				expect(mock_ec2.describeAddressesAsync).to.have.not.been.called;

				expect(mock_ec2.disassociateAddressAsync).to.have.not.been.called;

				expect(mock_ec2.associateAddressAsync).to.have.not.been.called;

				expect(result).eql([instance_id]);
			})
			.catch(err => {
				expect(err).to.eql(expected_err);
			});
	});
});
