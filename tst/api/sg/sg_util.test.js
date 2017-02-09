'use strict';

describe('SGUtil', function(){
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
			let EventEmitter = require('events');
			class fake_emitter extends EventEmitter {}
			sandbox.stub(require('https'), 'get', function(url, cb){
				let obj = new fake_emitter();
				cb(obj);
				obj.emit('data', 'fake_ip');
				obj.emit('end');
			});
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
