'use strict';

describe.only('create ami', function(){
	var create,
			sandbox,
			expect,
			describe_sg_spy,
			run_instances_spy;

	before(function(){
		create = require('../../../src/api/ami/create');
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		sandbox = require('sinon').sandbox.create();
		//mock ec2
		const mock_ec2 = {
			runInstancesAsync: function(){
				return Promise.resolve({
					Instances: [
						{
							InstanceId: 'fake-instance-id-1'
						}
					]
				});
			},
			describeSecurityGroupsAsync: function(){
				return Promise.resolve({
					SecurityGroups: [
						{
							GroupId: 'fake-sg-id-1'
						}
					]
				});
			},
			describeVpcsAsync: function(){
				return Promise.resolve({
					Vpcs: [
						{
							VpcId: 'fake-vpc-id-1'
						}
					]
				});
			},
			describeSubnetsAsync: function(){
				return Promise.resolve({
					Subnets: [
						{
							SubnetId: 'fake-subnet-id-1'
						}
					]
				});
			},
			describeImagesAsync: function(){
				return Promise.resolve({
					Images: [
						{
							ImageId: 'fake-ami-id-1'
						}
					]
				});
			},
			describeInstancesAsync: function(){
				return Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: 'fake-instance-id-1'
								}
							]
						}
					]
				});
			}
		};

		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		run_instances_spy = sandbox.spy(mock_ec2, 'runInstancesAsync');
		describe_sg_spy = sandbox.spy(mock_ec2, 'describeSecurityGroupsAsync');

		//mock fs
		sandbox.stub(require('fs'), 'readFileAsync', function(file){
			if(file === 'fake-file-1') {
				return Promise.resolve('echo "hi there"\n');
			} else if(file === 'fake-file-2') {
				return Promise.resolve('echo "my friend"\n');
			} else {
				return Promise.reject(new Error(`uh oh! we arent ready to test for file name ${file}!`));
			}
		});
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should create an ami in all regions', function(){
		let ud_files = ['fake-file-1', 'fake-file-2'];
		let disks = [];
		return create(['us-east-1', 'us-west-2'], 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1']).then(function(result){
			let expected_ud = '#!/bin/bash\n\n';
			expected_ud += 'set -o pipefail\n';
			expected_ud += 'set -e -x\n';
			expected_ud += 'exec >> /tmp/exec.log 2>&1\n\n';

			expected_ud += 'echo "hi there"\n';
			expected_ud += 'echo "my friend"\n';
			expected_ud += 'aws ec2 create-tags --region us-east-1 --resources `ec2metadata --instance-id` --tags Key=Spinup,Value=complete\n';

			expect(run_instances_spy).to.have.been.calledWith({
				BlockDeviceMappings: [],
				EbsOptimized: false,
				IamInstanceProfile: {
					Name: 'fake-iam'
				},
				ImageId: 'fake-ami-id-1',
				InstanceType: 'c4.large',
				KeyName: 'fake-key',
				MaxCount: 1,
				MinCount: 1,
				Monitoring: {
					Enabled: true
				},
				NetworkInterfaces: [{
					AssociatePublicIpAddress: true,
				  DeviceIndex: 0,
				  Groups: ["fake-sg-id-1"],
				  SubnetId: "fake-subnet-id-1"
				}],
				UserData: (new Buffer(expected_ud).toString('base64'))
			});
		});
	});

});
