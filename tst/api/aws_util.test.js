'use strict';

describe('AWSUtil', function(){

	let AWSUtil,

			expect,
			sinon,
			sandbox,
			mock_ec2;

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
		let AWSProvider = require('../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_iam', () => mock_iam);
		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
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

});
