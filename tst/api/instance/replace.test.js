'use strict';

const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

const expect = chai.expect;

const sinon = require('sinon');

const AWSProvider = require('../../../src/api/aws_provider');
const AWSUtil = require('../../../src/api/aws_util');
const instance = require('../../../src/api/instance');


describe('instance replace', function () {
	let sandbox, mock_elb, mock_ec2;
	let old_instance_id = '456';
	let new_instance_id = '123';
	let alloc_id = 'aloc123';
	let assoc_id = 'assoc123';
	let pub_ip = '999.999.999.999';

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
			),
			describeInstancesAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [{
						Instances: [{
							PublicIpAddress: pub_ip
						}]
					}]
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

		sandbox.stub(AWSProvider, 'get_elb', () => mock_elb);
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		sandbox.stub(AWSUtil, 'get_instance_by_name', (region, name) => {
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

	it('replaces an instance when associating an elastic IP successfully', function () {
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', true)
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

				expect(mock_ec2.describeInstancesAsync).to.have.been.calledWith({
					Filters: [
						{
							Name: 'instance-id',
							Values: [old_instance_id]
						}
					]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.have.been.calledWith({
					AssociationId: assoc_id
				});

				expect(mock_ec2.associateAddressAsync).to.have.been.calledWith({
					AllocationId: alloc_id,
					InstanceId: new_instance_id
				});
			});
	});

	it('replaces an instance when not association an elastic IP successfully', function () {
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', false)
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

				expect(mock_ec2.describeInstancesAsync).to.not.have.been.called;

				expect(mock_ec2.describeAddressesAsync).to.not.have.been.called;

				expect(mock_ec2.disassociateAddressAsync).to.not.have.been.called;

				expect(mock_ec2.associateAddressAsync).to.not.have.been.called;
			});
	});

	it('replaces an instance when associate elastic IP but instance description not found', function () {
		mock_ec2.describeInstancesAsync = sandbox.stub().returns(
			Promise.reject(new Error("Something wrong"))
		);
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', true)
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

				expect(mock_ec2.describeInstancesAsync).to.have.been.calledWith({
					Filters: [
						{
							Name: 'instance-id',
							Values: [old_instance_id]
						}
					]
				});

				expect(mock_ec2.describeAddressesAsync).to.not.have.been.called;

				expect(mock_ec2.disassociateAddressAsync).to.not.have.been.called;

				expect(mock_ec2.associateAddressAsync).to.not.have.been.called;
			});
	});

	it('replaces an instance when associate elastic IP but EIP not found', function () {
		mock_ec2.describeAddressesAsync = sandbox.stub().returns(
			Promise.reject(new Error("Something wrong"))
		);
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', true)
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

				expect(mock_ec2.describeInstancesAsync).to.have.been.calledWith({
					Filters: [
						{
							Name: 'instance-id',
							Values: [old_instance_id]
						}
					]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.not.have.been.called;

				expect(mock_ec2.associateAddressAsync).to.not.have.been.called;
			});
	});

	it.only('does not replace an instance when failure to detach EIP from target', function () {
		let rejection_msg = "Something wrong";
		mock_ec2.disassociateAddressAsync = sandbox.stub().returns(
			Promise.reject(new Error(rejection_msg))
		);
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', true)
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

				expect(mock_ec2.describeInstancesAsync).to.have.been.calledWith({
					Filters: [
						{
							Name: 'instance-id',
							Values: [old_instance_id]
						}
					]
				});

				expect(mock_ec2.describeAddressesAsync).to.have.been.calledWith({
					PublicIps: [pub_ip]
				});

				expect(mock_ec2.disassociateAddressAsync).to.be.eventually.rejectedWith(Error, rejection_msg);

				expect(mock_ec2.associateAddressAsync).to.not.have.been.called;

				expect(mock_ec2.terminateInstancesAsync).to.not.have.been.called;
			});
	});

	it('should not replace an instance when failure to attach EIP to source', function () {
		mock_ec2.associateAddressAsync = sandbox.stub().returns(
			Promise.reject(new Error("Something wrong"))
		);
		return instance
			.replace(['us-east-1'], 'old-instance', 'new-instance', true)
			.then(function () {
				expect(mock_elb.registerInstancesWithLoadBalancerAsync.calledWith({
					Instances: [{InstanceId: new_instance_id}],
					LoadBalancerName: 'lb'
				})).to.be.true;

				expect(mock_elb.deregisterInstancesFromLoadBalancerAsync.calledWith({
					Instances: [{InstanceId: old_instance_id}],
					LoadBalancerName: 'lb'
				})).to.be.true;

				expect(mock_elb.waitForAsync.calledWith(
					'instanceInService',
					{
						LoadBalancerName: 'lb',
						Instances: [
							{
								InstanceId: new_instance_id
							}
						]
					}
				)).to.be.true;

				expect(mock_ec2.describeInstancesAsync.calledWith({
					Filters: [
						{
							Name: 'instance-id',
							Values: [old_instance_id]
						}
					]
				})).to.be.true;

				expect(mock_ec2.describeAddressesAsync.calledWith({
					PublicIps: [pub_ip]
				})).to.be.true;

				expect(mock_ec2.disassociateAddressAsync.calledWith({
					AssociationId: assoc_id
				})).to.be.true;

				expect(mock_ec2.associateAddressAsync.calledWith({
					AllocationId: alloc_id,
					InstanceId: new_instance_id
				})).to.be.true;

				expect(mock_ec2.terminateInstancesAsync.calledWith({
					InstanceIds: [old_instance_id]
				})).to.be.false;
			});
	});
});
