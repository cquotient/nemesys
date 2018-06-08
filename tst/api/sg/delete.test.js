'use strict';

describe('delete sg', function(){

	let delete_sg,
			expect,
			ec2_mock,
			sandbox;

	beforeEach(function(){
		delete_sg = require('../../../src/api/sg/delete');
		sandbox = require('sinon').createSandbox();
		let chai = require('chai');
		chai.use(require('sinon-chai'));
		expect = chai.expect;

		ec2_mock = {
			describeSecurityGroupsAsync: sandbox.stub().callsFake(function(params){
				if(params.Filters[0].Name !== 'group-name'
				|| params.Filters[0].Values[0] !== 'fake-sg') {
					return Promise.reject(new Error('well thats not right'));
				}
				return Promise.resolve({
					SecurityGroups: [
						{
							GroupId: 'fake-sg-id'
						}
					]
				});
			}),
			deleteSecurityGroupAsync: sandbox.stub().callsFake(() => Promise.resolve())
		};
		let AWSProvider = require('../../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_ec2').callsFake(() => ec2_mock);
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should delete a security group from multiple regions', function(){
		return delete_sg(['us-east-1', 'us-west-2'], 'fake-sg')
		.then(function(){
			expect(ec2_mock.deleteSecurityGroupAsync).to.have.been.calledTwice;
			expect(ec2_mock.deleteSecurityGroupAsync).to.have.been.calledWith({
				DryRun: false,
				GroupId: 'fake-sg-id'
			});
		});
	});

});
