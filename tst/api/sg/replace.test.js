'use strict';

describe('replace sg', function(){

	let replace,
			sandbox,
			sinon_chai,
			expect,
			describe_sg_spy,
			authorize_sg_spy,
			revoke_sg_spy;

	beforeEach(function(){
		replace = require('../../../src/api/sg/replace');
		sandbox = require('sinon').sandbox.create();
		let chai = require('chai');
		sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;

		// mock ec2 api calls
		let AWSProvider = require('../../../src/api/aws_provider');
		let ec2_mock = {
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
						case 'fake-sg-ssh':
							return Promise.resolve({
								"SecurityGroups": [
									{
										GroupId: 'fake-sg-ssh-id'
									}
								]
							});
						case 'fake-sg-manyip':
							return Promise.resolve({
								"SecurityGroups": [
									{
										GroupId: 'fake-sg-manyip-id'
									}
								]
							});
						default:
							return Promise.reject('looks like this guy isnt stubbed!');
					}
				} else {
					switch(params.GroupIds[0]) {
						case 'fake-sg-id':
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
						case 'fake-sg-ssh-id':
							return Promise.resolve({
								"SecurityGroups": [
									{
										"GroupName": "fake-sg-ssh",
										"GroupId": "fake-sg-ssh-id",
										"IpPermissions": [
											{
												"IpProtocol": "tcp",
												"FromPort": 22,
												"ToPort": 22,
												"UserIdGroupPairs": [],
												"IpRanges": [
													{
														"CidrIp": "1.2.3.4/32"
													},
													{
														"CidrIp": "2.2.3.4/32"
													},
													{
														"CidrIp": "3.2.3.4/32"
													},
													{
														"CidrIp": "4.2.3.4/32"
													}
												]
											}
										]
									}
								]
							});
						case 'fake-sg-manyip-id':
							return Promise.resolve({
								"SecurityGroups": [
									{
										"GroupName": "fake-sg-ssh",
										"GroupId": "fake-sg-ssh-id",
										"IpPermissions": [
											{
												"IpProtocol": "tcp",
												"FromPort": 7000,
												"ToPort": 7000,
												"UserIdGroupPairs": [],
												"IpRanges": [
													{
														"CidrIp": "1.2.3.4/32"
													}
												]
											}
										]
									}
								]
							});
						default:
							return Promise.reject('uh oh, this sg group id is not stubbed!');
					}
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
		let ingress = ['fake-sg-allow-1-name:9043',
									'fake-sg-allow-1-name:9044:udp',
									'1.2.3.4/32:9998:tcp',
									'1.2.3.4/32:9998:udp'];
		return replace(['us-east-1'], 'fake-sg', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg"]}]});
			expect(authorize_sg_spy).to.not.have.been.called;
			expect(revoke_sg_spy).to.not.have.been.called;
		});
	});

	it('should add one ip rule', function(){
		let ingress = ['fake-sg-allow-1-name:9043',
									'fake-sg-allow-1-name:9044:udp',
									'1.2.3.4/32:9998:tcp',
									'1.2.3.4/32:9998:udp',
									'1.2.3.4/32:8080'];
		return replace(['us-east-1'], 'fake-sg', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg"]}]});
			expect(authorize_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: "fake-sg-id",
				IpPermissions: [{
					FromPort: 8080,
					IpProtocol: "tcp",
					IpRanges: [{ CidrIp: "1.2.3.4/32" }],
					ToPort: 8080
				}]
			});
			expect(revoke_sg_spy).to.not.have.been.called;
		});
	});

	it('should remove one ip rule', function(){
		let ingress = ['fake-sg-allow-1-name:9043',
									'fake-sg-allow-1-name:9044:udp',
									'1.2.3.4/32:9998:udp'];
		return replace(['us-east-1'], 'fake-sg', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg"]}]});
			expect(authorize_sg_spy).to.not.have.been.called;
			expect(revoke_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: "fake-sg-id",
				IpPermissions: [{
					FromPort: 9998,
					IpProtocol: "tcp",
					IpRanges: [{ CidrIp: "1.2.3.4/32" }],
					ToPort: 9998
				}]
			});
		});
	});

	it('should remove one sg rule', function(){
		let ingress = ['fake-sg-allow-1-name:9044:udp',
									'1.2.3.4/32:9998:tcp',
									'1.2.3.4/32:9998:udp'];
		return replace(['us-east-1'], 'fake-sg', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg"]}]});
			expect(authorize_sg_spy).to.not.have.been.called;
			expect(revoke_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: "fake-sg-id",
				IpPermissions: [{
					FromPort: 9043,
					IpProtocol: "tcp",
					UserIdGroupPairs: [
						{
							GroupId: 'fake-sg-allow-1-id'
						}
					],
					ToPort: 9043
				}]
			});
		});
	});

	it('should remove many ip rules', function(){
		let ingress = ['1.2.3.4/32:22'];
		return replace(['us-east-1'], 'fake-sg-ssh', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg-ssh"]}]});
			expect(authorize_sg_spy).to.not.have.been.called;
			expect(revoke_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: "fake-sg-ssh-id",
				IpPermissions: [
					{
						FromPort: 22,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "2.2.3.4/32"
							}
						],
						ToPort: 22
					},
					{
						FromPort: 22,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "3.2.3.4/32"
							}
						],
						ToPort: 22
					},
					{
						FromPort: 22,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "4.2.3.4/32"
							}
						],
						ToPort: 22
					}
				]
			});
		});
	});

	it('should add many ip rules, for a range', function(){
		let ingress = [
			'1.2.3.4/32:7000-7001',
			'2.2.3.4/32:7000-7001',
			'3.2.3.4/32:7000-7001',
			'4.2.3.4/32:7000-7001'
		];
		return replace(['us-east-1', 'us-west-2'], 'fake-sg-manyip', ingress).then(function(result){
			expect(describe_sg_spy).to.have.been.calledWith({"DryRun":false,"Filters":[{"Name":"group-name","Values":["fake-sg-manyip"]}]});
			expect(authorize_sg_spy).to.have.been.calledWith({
				DryRun: false,
				GroupId: "fake-sg-manyip-id",
				IpPermissions: [
					{
						FromPort: 7000,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "1.2.3.4/32"
							}
						],
						ToPort: 7001
					},
					{
						FromPort: 7000,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "2.2.3.4/32"
							}
						],
						ToPort: 7001
					},
					{
						FromPort: 7000,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "3.2.3.4/32"
							}
						],
						ToPort: 7001
					},
					{
						FromPort: 7000,
						IpProtocol: "tcp",
						IpRanges: [
							{
								"CidrIp": "4.2.3.4/32"
							}
						],
						ToPort: 7001
					}
				]
			});
		});
	});

});
