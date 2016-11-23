'use strict';

describe('parse_args', function(){

	var testee,

		assert,
		sinon,
		sandbox;

	before(function(){
		assert = require('chai').assert;
		sinon = require('sinon');
		sinon.assert.expose(require('chai').assert, { prefix: "" });
	});

	beforeEach(function(){
		sandbox = sinon.sandbox.create();
		sandbox.stub(process, 'exit');
		sandbox.stub(console, 'error');
		sandbox.stub(console, 'log');
		testee = require('../../src/cli/parse_args');
	});

	afterEach(function(){
		sandbox.restore();
	});

	describe('#parse_args()', function(){
		it('exits if not commands provided', function(){
			testee.parse_args([])
			assert.calledOnce(process.exit);
		});

		describe('create instance', function(){
			let commands, opts;

			beforeEach(function(){
				require('yargs').reset();
				commands = ['create', 'instance'];
				opts = [
					'--ami=test_ami',
					'--instance-type=xxxxxxxxxxxTest',
					'--ssh-key-pair=mykeys',
					'--availability-zone=q',
					'--vpc=testVpc',
					'--regions=us-east-1'
				];
			});

			it('returns args passed', function(){
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.ami, 'test_ami');
				assert.equal(actual['instance-type'], 'xxxxxxxxxxxTest');
				assert.equal(actual['ssh-key-pair'], 'mykeys');
				assert.equal(actual['availability-zone'], 'q');
				assert.equal(actual['vpc'], 'testVpc');
				assert.equal(actual['regions'], 'us-east-1');
			});

			it('errors if missing required envs', function(){
				opts.push('--required-env=rum');
				opts.push('--required-env=ale');

				testee.parse_args(commands.concat(opts));
				assert.calledOnce(process.exit);
				assert.match(console.error.args[0][0], /Missing required ENVs:/);
				assert.match(console.error.args[0][0], /rum/);
				assert.match(console.error.args[0][0], /ale/);
			});

			it('does no error if required envs are passed', function(){
				opts.push('--required-env=rum');
				opts.push('--required-env=ale');
				opts.push('--env=ale=good');
				opts.push('--env=rum=great');

				testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
			})
		});

	});

});
