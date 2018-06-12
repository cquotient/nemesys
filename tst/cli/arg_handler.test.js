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
		sandbox = require('sinon').createSandbox();
	});

	afterEach(function(){
		sandbox.restore();
	});

	describe('error handling', function(){

		let log_spy;

		beforeEach(function(){
			let Logger = require('../../src/logger');
			log_spy = Logger.info;
		});

		it('should exit with an unrecognized command', function(){
			let cmd = {command: 'asdf'};
			arg_handler.handle(cmd);
			expect(log_spy).to.have.been.calledWith('Unrecognized command: asdf');
		});

	});

	describe('update', function(){

		describe('sg', function(){

			describe('errors', function(){

				let err_log_spy,
						create_sg_stub;

				beforeEach(function(){
					let Logger = require('../../src/logger');
					err_log_spy = Logger.error;
					create_sg_stub = sandbox.stub(require('../../src/api/asg'), 'create').callsFake(function(){
						return Promise.reject(new Error('uh oh!'));
					});
				});

				it('should exit and print the error when the command fails', function(done){
					let cmd = {
						command: 'create',
						target: 'asg',
						opts: {
							regions: ['us-east-1'],
							vpc: 'fake-vpc',
							group: 'fake-asg-name',
							'launch-config': 'fake-lc'
						}
					};
					arg_handler.handle(cmd);
					setImmediate(function(){
						try {
							expect(err_log_spy).to.have.been.called;
							done();
						} catch(e) {
							done(e);
						}
					});
				});

			});

			describe('successes', function(){

				let update_sg_stub,
						delete_sg_stub,
						replace_sg_stub;

				beforeEach(function(){
					let sg = require('../../src/api/sg');
					update_sg_stub = sandbox.stub(sg, 'update').returns(Promise.resolve());
					delete_sg_stub = sandbox.stub(sg, 'delete').returns(Promise.resolve());
					replace_sg_stub = sandbox.stub(sg, 'replace').returns(Promise.resolve());
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

				it('should invoke sg delete', function(){
					let cmd = {
						command: 'delete',
						target: 'sg',
						opts: {
							regions: ['us-east-1'],
							'security-group': 'fake-sg'
						}
					};
					arg_handler.handle(cmd);
					expect(delete_sg_stub).to.have.been.calledWith(
						['us-east-1'],
						'fake-sg'
					);
				});

				it('should invoke sg replace', function(){
					let cmd = {
						command: 'replace',
						target: 'sg',
						opts: {
							regions: ['us-east-1'],
							'security-group': 'fake-sg',
							'ingress-rules': ['1.2.3.4/32:22']
						}
					};
					arg_handler.handle(cmd);
					expect(replace_sg_stub).to.have.been.calledWith(
						['us-east-1'],
						'fake-sg',
						['1.2.3.4/32:22']
					);
				});

			});

		});

	});

});
