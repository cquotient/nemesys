'use strict';

describe('AWSUtil', function(){

	let AWSUtil,

			expect,
			sinon,
			sandbox,
			mock_ec2,
			mock_as;

	before(function(){
		AWSUtil = require('../../src/api/aws_util');
		expect = require('chai').expect;
		sinon = require('sinon');
	});

	beforeEach(function(){
		sandbox = sinon.sandbox.create();
		const mock_iam = {
			getUserAsync: function(){
				return Promise.resolve({
					"User":{"Arn":"arn:aws:iam::fake-account-id:user/jane.doe"}
				});
			}
		};
		mock_ec2 = {
			describeSnapshotsAsync: sandbox.stub().returns(Promise.resolve({
					Snapshots: [
							{
									SnapshotId: 'snapshot-fake',
							}
					]
				})
			)
		};
		let good_desc_asg_resp;
		let desc_asg_stub = sandbox.stub();
		desc_asg_stub.onCall(0).returns(Promise.reject({
			code: 'Throttling'
		}));
		desc_asg_stub.onCall(1).returns(Promise.resolve());
		mock_as = {
			describeAutoScalingGroupsAsync: desc_asg_stub
		};
		let AWSProvider = require('../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_iam', () => mock_iam);
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
		sandbox.stub(AWSProvider, 'get_as', () => mock_as);
	});

	afterEach(function(){
		sandbox.restore();
	});

	describe('#get_account_id()', function(){

		it('should return an account id', function(){
			return AWSUtil.get_account_id()
			.then(function(id){
				expect(id).to.eql('fake-account-id');
			});
		});

	});

	describe('#get_bdms()', function(){

		it('should return the param expected by aws api, with snapshot ids resolved', function(){
			let bdms_arg = ["/dev/sdj:ebs:3200:gp2:ex_snap_name", "/dev/sdk:ebs:100:gp2"];
			return AWSUtil.get_bdms('us-east-1', bdms_arg)
				.then(function(api_param){
					expect(api_param).to.eql([
						{
							DeviceName: '/dev/sdj',
							Ebs: {
								VolumeSize: '3200',
								VolumeType: 'gp2',
								DeleteOnTermination: true,
								SnapshotId: 'snapshot-fake'
							}
						},
						{
							DeviceName: '/dev/sdk',
							Ebs: {
								VolumeSize: '100',
								VolumeType: 'gp2',
								DeleteOnTermination: true
							}
						}
					]);
					expect(mock_ec2.describeSnapshotsAsync).to.have.been.calledWith({
						Filters: [
							{
								Name: 'tag:Name',
								Values: ['ex_snap_name']
							}
						]
					});
				});
		});

	});

	describe('#get_asg()', function(){

		it('should withstand a rate limiting error', function(){
			// the first time describeAutoScalingGroups is called, it throws an error,
			// so just making sure this succeeds tests that the error is handled
			return AWSUtil.get_asg(mock_as, 'fake-as-name', 1, 1);
		});

	});

});
