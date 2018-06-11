'use strict';

describe('delete ami', function(){

	let delete_ami,
			sandbox,
			expect,
			deregister_spy,
			delete_snap_spy;

	before(function(){
		delete_ami = require('../../../src/api/ami/delete');
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		sandbox = require('sinon').createSandbox();

		const mock_ec2 = {
			describeImagesAsync: function(){
				return Promise.resolve({
					Images: [
						{
							ImageId: 'test-ami-id-1',
							BlockDeviceMappings: [
								{
									VirtualName: 'ephemeral0',
									DeviceName: '/dev/sdb'
								},
								{
									VirtualName: 'ephemeral1',
									DeviceName: '/dev/sdc'
								},
								{
									DeviceName: '/dev/sdj',
									Ebs: {
										SnapshotId: 'test-snapshot-id-1'
									}
								},
								{
									DeviceName: '/dev/sdk',
									Ebs: {
										SnapshotId: 'test-snapshot-id-2'
									}
								}
							]
						}
					]
				});
			},
			deregisterImageAsync: () => Promise.resolve(),
			deleteSnapshotAsync: () => Promise.resolve()
		};

		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_ec2').returns(mock_ec2);
		deregister_spy = sandbox.spy(mock_ec2, 'deregisterImageAsync');
		delete_snap_spy = sandbox.spy(mock_ec2, 'deleteSnapshotAsync');
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should delete an ami in all regions', function(){
		let r = ['us-east-1', 'us-west-2'];
		let ami = 'test-ami-name-1';
		return delete_ami(r, ami).then(function(){
			expect(deregister_spy).to.have.been.calledWith({
				ImageId: 'test-ami-id-1'
			});
			expect(delete_snap_spy).to.have.been.calledWith({
				SnapshotId: 'test-snapshot-id-1'
			});
			expect(delete_snap_spy).to.have.been.calledWith({
				SnapshotId: 'test-snapshot-id-2'
			});
		});
	});

});
