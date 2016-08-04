'use strict';

describe('replace sg', function(){

	var replace,
			sandbox,
			chai,
			sinon_chai,
			expect,
			describe_sg_spy,
			authorize_sg_spy,
			revoke_sg_spy;

	beforeEach(function(){
		replace = require('../../../src/api/sg/replace');
		sandbox = require('sinon').sandbox.create();
		chai = require('chai');
		sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = require('chai').expect;

		// mock ec2 api calls
		var AWSProvider = require('../../../src/api/aws_provider');
		var ec2_mock = {
			describeSecurityGroupsAsync: function(params) {
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
						case 'fake-sg-allow-1-name':
							return Promise.resolve({
								"SecurityGroups": [
									{
										GroupId: 'fake-sg-allow-1-id'
									}
								]
							});
						default:
							return Promise.reject('looks like this guy isnt stubbed!');
					}
				} else {
					return Promise.resolve({
						"SecurityGroups":
						[{
							"OwnerId":"fakeownerid",
							"GroupName":"fake-sg",
							"GroupId":"sg-fakesgid",
							"Description":"ok",
							"IpPermissions":[
								{
									"IpProtocol":"udp",
									"FromPort":9998,
									"ToPort":9998,
									"UserIdGroupPairs":[],
									"IpRanges":[{
										"CidrIp":"1.2.3.4/32"
									}],
									"PrefixListIds":[]
								},{
									"IpProtocol":"tcp",
									"FromPort":9998,"ToPort":9998,
									"UserIdGroupPairs":[],
									"IpRanges":[{
										"CidrIp":"1.2.3.4/32"
									}],
									"PrefixListIds":[]
								},{
									"IpProtocol":"tcp",
									"FromPort":9043,
									"ToPort":9043,
									"UserIdGroupPairs":[{
										"UserId":"fake-user-id",
										"GroupId":"fake-sg-allow-1-id"
									}],
									"IpRanges":[],
									"PrefixListIds":[]
								},{
									"IpProtocol":"udp",
									"FromPort":9044,
									"ToPort":9044,
									"UserIdGroupPairs":[{
										"UserId":"fake-user-id",
										"GroupId":"fake-sg-allow-1-id"
									}],
									"IpRanges":[],
									"PrefixListIds":[]
								}
							],
							"VpcId":"fake-vpc-id",
							"Tags":[]
						}]});
					}
			},
			authorizeSecurityGroupIngressAsync: function(params) {
				return Promise.resolve();
			},
			revokeSecurityGroupIngressAsync: function(params) {
				return Promise.resolve();
			}
		};
		describe_sg_spy = sandbox.spy(ec2_mock, 'describeSecurityGroupsAsync');
		authorize_sg_spy = sandbox.spy(ec2_mock, 'authorizeSecurityGroupIngressAsync');
		revoke_sg_spy = sandbox.spy(ec2_mock, 'revokeSecurityGroupIngressAsync');
		sandbox.stub(AWSProvider, 'get_ec2', function(region){
			return ec2_mock;
		});
	});

	afterEach(function(){
		sandbox.restore();
	});

	it('should make no changes if not necessary', function(){
		var ingress = ['fake-sg-allow-1-name:9043',
									'fake-sg-allow-1-name:9044:udp',
									'1.2.3.4/32:9998:tcp',
									'1.2.3.4/32:9998:udp'];
		return replace(['us-east-1'], 'fake-sg', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg"]}]});
			expect(authorize_sg_spy).to.not.have.been.called;
			expect(revoke_sg_spy).to.not.have.been.called;
		});
	});

});
