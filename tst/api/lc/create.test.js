'use strict';

describe('create lc', function(){

	let create,
			expect,
			sandbox,
			create_lc_stub;

	before(function(){
		create = require('../../../src/api/lc/create');
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		const AWSUtil = require('../../../src/api/aws_util');
		const AWSProvider = require('../../../src/api/aws_provider');
		sandbox = require('sinon').createSandbox();
		create_lc_stub = sandbox.stub();
		const mock_as = {
			createLaunchConfigurationAsync: create_lc_stub
		};
		sandbox.stub(AWSProvider, 'get_as').returns(mock_as);
		sandbox.stub(AWSUtil, 'get_userdata_string').callsFake((ud_files, env_vars, raw_ud_string) => Promise.resolve(
			'userdata_string'
		));
		sandbox.stub(AWSUtil, 'get_sg_ids').returns(Promise.resolve(['fake-sg-id']));
		sandbox.stub(AWSUtil, 'get_ami_id').returns(Promise.resolve('fake-ami-id'));
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should create a launch configuration', function(){
		return create(['us-east-1'], 'fake-lc', 'fake-ami', 'fake-instance-type',
			'fake-key', ['fake-sg'], 'fake-iam-role', [], [],
			['/dev/sda1:ebs:24:gp2', '/dev/sdj:ebs:100:gp2'], 0.10)
		.then(function(){
			expect(create_lc_stub).to.have.been.calledWith({
				LaunchConfigurationName: 'fake-lc',
				AssociatePublicIpAddress: true,
				BlockDeviceMappings: [
					{
						DeviceName: '/dev/sda1',
						Ebs: {
							VolumeSize: '24',
							VolumeType: 'gp2',
							DeleteOnTermination: true
						}
					},
					{
						DeviceName: '/dev/sdj',
						Ebs: {
							VolumeSize: '100',
							VolumeType: 'gp2',
							DeleteOnTermination: true
						}
					}
				],
				IamInstanceProfile: 'fake-iam-role',
				ImageId: 'fake-ami-id',
				InstanceMonitoring: {
					Enabled: true
				},
				InstanceType: 'fake-instance-type',
				KeyName: 'fake-key',
				SecurityGroups: ['fake-sg-id'],
				UserData: (new Buffer('userdata_string').toString('base64'))
			});
		});
	});

});
