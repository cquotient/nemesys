'use strict';

describe('arg_handler', function(){

	let arg_handler,
			expect,
			sandbox;

	before(function(){
		arg_handler = require('../../src/cli/arg_handler');
		let chai = require('chai');
		let sinon_chai = require('sinon-chai');
		chai.use(sinon_chai);
		expect = chai.expect;
	});

	beforeEach(function(){
		sandbox = require('sinon').sandbox.create();
	});

	afterEach(function(){
		sandbox.restore();
	});

	describe('update', function(){

		describe('sg', function(){
			let update_sg_stub;

			beforeEach(function(){
				update_sg_stub = sandbox.stub(require('../../src/api/sg'), 'update', () => Promise.resolve());
			});

			it('should invoke sg update', function(){
				let cmd = {
					command: 'update',
					target: 'sg',
					opts: {
						"regions": ['us-east-1', 'us-west-2'],
						"security-group": 'fake-sg',
						"ingress-rules": ['1.2.3.4/32:22']
					}
				};
				arg_handler.handle(cmd);
				expect(update_sg_stub).to.have.been.calledWith(
					['us-east-1', 'us-west-2'],
					'fake-sg',
					['1.2.3.4/32:22']
				);
			});

		});

	});

});
