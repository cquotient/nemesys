'use strict';

describe('create ami', function(){
	let create,
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
		sandbox = require('sinon').createSandbox();
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
					Reservations: [
						{
							Instances: [
								{
									InstanceId: 'fake-instance-id-1',
									State: {
										Name: 'running'
									}
								}
							]
						}
					]
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
			},
			createTagsAsync: function(){
				return Promise.resolve({

				});
			}
		};

		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);
		run_instances_spy = sandbox.spy(mock_ec2, 'runInstancesAsync');
		describe_sg_spy = sandbox.spy(mock_ec2, 'describeSecurityGroupsAsync');
		describe_instances_spy = sandbox.spy(mock_ec2, 'describeInstancesAsync');
		create_image_spy = sandbox.spy(mock_ec2, 'createImageAsync');
		wait_for_spy = sandbox.spy(mock_ec2, 'waitForAsync');
		copy_image_spy = sandbox.spy(mock_ec2, 'copyImageAsync');
		terminate_spy = sandbox.spy(mock_ec2, 'terminateInstancesAsync');


		//mock fs
		sandbox.stub(require('fs'), 'readFileAsync').callsFake(function(file){
			const mocked_files = {
				"fake-file-1": 'echo "hi there"\n',
				"fake-file-2": 'echo "my friend"\n',
				"fake-rud-file-1": 'echo "region one"\n',
				"fake-rud-file-2": 'echo "region two"\n'
			};

			if (mocked_files.hasOwnProperty(file)) {
				return Promise.resolve(`${mocked_files[file]}`);
			}

			return Promise.reject(new Error(`uh oh! we arent ready to test for file name ${file}!`));
		});
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should create an ami then copy to all regions', function(){
		this.timeout(10000);
		let ud_files = ['fake-file-1', 'fake-file-2'];
		let disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1', 'us-west-2'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1'], false, false).then(function(result){
			let expected_ud = '#!/bin/bash\n\n';
			expected_ud += 'set -o pipefail\n';
			expected_ud += 'set -e -x\n';
			expected_ud += 'exec >> /tmp/exec.log 2>&1\n\n';

			expected_ud += 'echo "hi there"\n';
			expected_ud += 'echo "my friend"\n';
			expected_ud += '\naws ec2 create-tags --region us-east-1 --resources `curl http://169.254.169.254/latest/meta-data/instance-id` --tags Key=Spinup,Value=complete\n';

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

			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-1'], $waiter: { delay: 60, maxAttempts: 30 }
			});

			expect(copy_image_spy).to.have.been.calledWith({
				Name: 'fake-ami',
				SourceImageId: 'fake-image-id-1',
				SourceRegion: 'us-east-1'
			});

			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-2'], $waiter: { delay: 60, maxAttempts: 30 }
			});

			expect(terminate_spy).to.have.been.calledWith({
				InstanceIds: ['fake-instance-id-1']
			});
		});
	});

	it('should create an ami in both regions - two rud files, distinct_regions false', function(){
		this.timeout(10000);
		const ud_files = ['fake-file-1', 'fake-file-2'];
		const rud_files = ['fake-rud-file-1', 'fake-rud-file-2'];
		const disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1', 'us-west-2'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, rud_files, disks, ['fake-az-1', 'fake-az-2'], false, false).then(function(result){
			expect(run_instances_spy).to.have.been.calledTwice;
			expect(create_image_spy).to.have.been.calledTwice;
			expect(copy_image_spy).to.not.have.been.called;
			expect(terminate_spy).to.have.been.calledTwice;
		});
	});

	it('should create an ami in both regions - two rud files, distinct_regions true', function(){
		this.timeout(10000);
		const ud_files = ['fake-file-1', 'fake-file-2'];
		const rud_files = ['fake-rud-file-1', 'fake-rud-file-2'];
		const disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		const ud_header = '#!/bin/bash\n\nset -o pipefail\nset -e -x\nexec >> /tmp/exec.log 2>&1\n\n';
		const base_ud = 'echo "hi there"\necho "my friend"\n';
		const us_east_1_rud = 'echo "region one"\n';
		const us_west_2_rud = 'echo "region two"\n';
		const use1_spinup_complete_ud = '\naws ec2 create-tags --region us-east-1 --resources `curl http://169.254.169.254/latest/meta-data/instance-id` --tags Key=Spinup,Value=complete\n';
		const usw2_spinup_complete_ud = '\naws ec2 create-tags --region us-west-2 --resources `curl http://169.254.169.254/latest/meta-data/instance-id` --tags Key=Spinup,Value=complete\n';
		return create(['us-east-1', 'us-west-2'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, rud_files, disks, ['fake-az-1', 'fake-az-2'], false, true).then(function(result){
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
				UserData: (new Buffer(ud_header + us_east_1_rud + base_ud + use1_spinup_complete_ud).toString('base64'))
			});
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
				UserData: (new Buffer(ud_header + us_west_2_rud + base_ud + usw2_spinup_complete_ud).toString('base64'))
			});
			expect(create_image_spy).to.have.been.calledTwice;
			expect(copy_image_spy).to.not.have.been.called;
			expect(terminate_spy).to.have.been.calledTwice;
		});
	});

	it('should create an ami in both regions - no rud files, distinct_regions true', function(){
		this.timeout(10000);
		const ud_files = ['fake-file-1', 'fake-file-2'];
		const disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1', 'us-west-2'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1', 'fake-az-2'], false, true).then(function(result){
			expect(run_instances_spy).to.have.been.calledTwice;
			expect(create_image_spy).to.have.been.calledTwice;
			expect(copy_image_spy).to.not.have.been.called;
			expect(terminate_spy).to.have.been.calledTwice;
		});
	});

	it('should create an ami in one region', function(){
		let ud_files = ['fake-file-1', 'fake-file-2'];
		let disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1']).then(function(result){
			let expected_ud = '#!/bin/bash\n\n';
			expected_ud += 'set -o pipefail\n';
			expected_ud += 'set -e -x\n';
			expected_ud += 'exec >> /tmp/exec.log 2>&1\n\n';

			expected_ud += 'echo "hi there"\n';
			expected_ud += 'echo "my friend"\n';
			expected_ud += '\naws ec2 create-tags --region us-east-1 --resources `curl http://169.254.169.254/latest/meta-data/instance-id` --tags Key=Spinup,Value=complete\n';

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

			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-1'], $waiter: { delay: 60, maxAttempts: 30 }
			});

			expect(terminate_spy).to.have.been.calledWith({
				InstanceIds: ['fake-instance-id-1']
			});
		});
	});

	it('should create an ami and preserve the instance', function(){
		let ud_files = ['fake-file-1', 'fake-file-2'];
		let disks = ['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:200:gp2', '/dev/sdb:ephemeral:ephemeral0'];
		return create(['us-east-1'], 'fake-ami', 'fake-vpc', 'fake-ami', 'c4.large', 'fake-key', ['fake-sg'], 'fake-iam', ud_files, null, disks, ['fake-az-1'], true).then(function(result){
			let expected_ud = '#!/bin/bash\n\n';
			expected_ud += 'set -o pipefail\n';
			expected_ud += 'set -e -x\n';
			expected_ud += 'exec >> /tmp/exec.log 2>&1\n\n';

			expected_ud += 'echo "hi there"\n';
			expected_ud += 'echo "my friend"\n';
			expected_ud += '\naws ec2 create-tags --region us-east-1 --resources `curl http://169.254.169.254/latest/meta-data/instance-id` --tags Key=Spinup,Value=complete\n';

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

			expect(wait_for_spy).to.have.been.calledWith('imageAvailable', {
				ImageIds: ['fake-image-id-1'], $waiter: { delay: 60, maxAttempts: 30 }
			});

			expect(terminate_spy).to.not.have.been.called;
		});
	});
});
