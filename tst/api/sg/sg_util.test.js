'use strict';

describe.skip('SGUtil', function(){
	let SGUtil,

			expect;

	before(function(){
		SGUtil = require('../../../src/api/sg/sg_util');
		expect = require('chai').expect;
	});

	describe('#get_my_ip()', function(){

		let sandbox;

		before(function(){
			sandbox = require('sinon').sandbox.create();

		});

		after(function(){
			sandbox.restore();
		});

		it('should get my public ipv4', function(){
			return SGUtil.get_my_ip()
			.then(function(ip){
				expect(ip).to.eql('fake_ip');
			});
		});

	});

});
