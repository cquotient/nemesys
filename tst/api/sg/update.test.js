'use strict';

describe('update sg', function(){
	let update,
			sandbox,
			expect,
			authorize_sg_spy;

	beforeEach(function(){
		update = require('../../../src/api/sg/update');
		sandbox = require('sinon').sandbox.create();
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;

		// mock ec2 api calls
		let AWSProvider = require('../../../src/api/aws_provider');
		let ec2_mock = {
			describeSecurityGroupsAsync: function(params){
				if(params.Filters
				&& params.Filters[0]) {
					switch(params.Filters[0].Values[0]) {
						case 'fake-sg':
							return Promise.resolve({
								"SecurityGroups": [
									{
										GroupId: 'fake-sg-id'
									}
								]
							});
						default:
							return Promise.reject('hmm, are you forgetting something?');
					}
				} else {
					return Promise.reject('oops, missing a stubbed describe sg response');
				}
			},
			authorizeSecurityGroupIngressAsync: function(params) {
				return Promise.resolve();
			}
		};
		authorize_sg_spy = sandbox.spy(ec2_mock, 'authorizeSecurityGroupIngressAsync');
		sandbox.stub(AWSProvider, 'get_ec2', () => ec2_mock);
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should give a specific ip address access', function(){
		let ingress = ['1.2.3.4/32:22'];
		return update(['us-east-1', 'us-west-2'], 'fake-sg', ingress)
		.then(function(){
			expect(authorize_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: 'fake-sg-id',
				IpPermissions: [{
					FromPort: 22,
					ToPort: 22,
					IpProtocol: 'tcp',
					IpRanges: [
						{
							CidrIp: '1.2.3.4/32'
						}
					]
				}]
			});
		});
	});

	it('should default to ssh port', function(){
		let ingress = ['1.2.3.4/32'];
		return update(['us-east-1', 'us-west-2'], 'fake-sg', ingress)
		.then(function(){
			expect(authorize_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: 'fake-sg-id',
				IpPermissions: [{
					FromPort: 22,
					ToPort: 22,
					IpProtocol: 'tcp',
					IpRanges: [
						{
							CidrIp: '1.2.3.4/32'
						}
					]
				}]
			});
		});
	});

});
