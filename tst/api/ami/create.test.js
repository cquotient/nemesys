'use strict';

describe('create ami', function(){
	var create,
			sandbox,
			expect,
			describe_sg_spy,
			run_instances_spy,
			describe_instances_spy,
			create_image_spy,
			wait_for_spy,
			copy_image_spy,
			terminate_spy;

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
							ImageId: 'fake-base-image-id-1'
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
				});
			},
			createImageAsync: function(){
				return Promise.resolve({
					ImageId: 'fake-image-id-1'
				});
			},
			waitForAsync: function(state, params){
				return Promise.resolve({

				});
			},
			copyImageAsync: function(){
				return Promise.resolve({
					ImageId: 'fake-image-id-2'
				});
			},
			terminateInstancesAsync: function(){
				return Promise.resolve({

				});
			}
		};

		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		run_instances_spy = sandbox.spy(mock_ec2, 'runInstancesAsync');
		describe_sg_spy = sandbox.spy(mock_ec2, 'describeSecurityGroupsAsync');
		describe_instances_spy = sandbox.spy(mock_ec2, 'describeInstancesAsync');
		create_image_spy = sandbox.spy(mock_ec2, 'createImageAsync');
		wait_for_spy = sandbox.spy(mock_ec2, 'waitForAsync');
		copy_image_spy = sandbox.spy(mock_ec2, 'copyImageAsync');
		terminate_spy = sandbox.spy(mock_ec2, 'terminateInstancesAsync');

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
		this.timeout(10000);
		let ud_files = ['fake-file-1', 'fake-file-2'];
		let disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1', 'us-west-2'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1']).then(function(result){
			let expected_ud = '#!/bin/bash\n\n';
			expected_ud += 'set -o pipefail\n';
			expected_ud += 'set -e -x\n';
			expected_ud += 'exec >> /tmp/exec.log 2>&1\n\n';

			expected_ud += 'echo "hi there"\n';
			expected_ud += 'echo "my friend"\n';
			expected_ud += 'aws ec2 create-tags --region us-east-1 --resources `ec2metadata --instance-id` --tags Key=Spinup,Value=complete\n';

			expect(run_instances_spy).to.have.been.calledWith({
				BlockDeviceMappings: [
					{
						DeviceName: "/dev/sda1",
						Ebs: { DeleteOnTermination: true, VolumeSize: "24", VolumeType: "gp2" }
					},
					{
						DeviceName: "/dev/sdj",
						Ebs: { DeleteOnTermination: true, VolumeSize: "200", VolumeType: "gp2" }
					},
					{
						DeviceName: "/dev/sdb", VirtualName: "ephemeral0"
					}
				],
				EbsOptimized: false,
				IamInstanceProfile: {
					Name: 'fake-iam'
				},
				ImageId: 'fake-base-image-id-1',
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

			//
			expect(describe_instances_spy).to.have.been.calledWith({
				InstanceIds: ['fake-instance-id-1']
			});

			expect(create_image_spy).to.have.been.calledWith({
				InstanceId: 'fake-instance-id-1',
				Name: 'fake-ami',
				BlockDeviceMappings: [
					{
						DeviceName: "/dev/sda1",
						Ebs: { DeleteOnTermination: true, VolumeSize: "24", VolumeType: "gp2" }
					},
					{
						DeviceName: "/dev/sdj",
						Ebs: { DeleteOnTermination: true, VolumeSize: "200", VolumeType: "gp2" }
					},
					{
						DeviceName: "/dev/sdb", VirtualName: "ephemeral0"
					}
				]
			});

			expect(wait_for_spy).to.have.been.calledWith('imageExists', {
				ImageIds: ['fake-image-id-1']
			});
			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-1']
			});

			expect(copy_image_spy).to.have.been.calledWith({
				Name: 'fake-ami',
				SourceImageId: 'fake-image-id-1',
				SourceRegion: 'us-east-1'
			});

			expect(wait_for_spy).to.have.been.calledWith('imageExists', {
				ImageIds: ['fake-image-id-2']
			});
			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-2']
			});

			expect(terminate_spy).to.have.been.calledWith({
				InstanceIds: ['fake-instance-id-1']
			});
		});
	});

});