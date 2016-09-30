'use strict';

describe('AWSUtil', function(){

	var AWSUtil,

			expect,
			sinon,
			sandbox;

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
		let AWSProvider = require('../../src/api/aws_provider');
		sandbox.stub(AWSProvider, 'get_iam', () => mock_iam);
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

});
