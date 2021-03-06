'use strict';

describe('parse_args', function(){

	let testee,
		Logger,

		assert,
		sinon,
		sandbox,
		path;

	before(function(){
		Logger = require('../../src/logger');
		assert = require('chai').assert;
		sinon = require('sinon');
		sinon.assert.expose(require('chai').assert, { prefix: "" });
		path = require('path');
	});

	beforeEach(function(){
		sandbox = sinon.createSandbox();
		testee = require('../../src/cli/parse_args');
	});

	afterEach(function(){
		sandbox.restore();
	});

	describe('#parse_args()', function(){
		it('exits if no commands provided', function(){
			testee.parse_args([]);
			assert.calledWith(process.exit, 1);
		});

		describe('file loading', function(){

			it('loads json file', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--json-config=' + __dirname + '/create_instance_example.json'
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTestJson');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
				assert.equal(actual.opts['region-user-data'][0], path.resolve(__dirname, 'file1'));
			});

			it('takes json file ahead of defaults', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--json-config=' + __dirname + '/create_instance_example.json'
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTestJson');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
				assert.equal(actual.opts['reassociate-eip'], true);
				assert.equal(actual.opts['region-user-data'][0], path.resolve(__dirname, 'file1'));
			});

			it('loads yaml file', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--yaml-config=' + __dirname + '/create_instance_example.yaml',
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTestYaml');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
			});

			it('takes yaml file ahead of defaults', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--yaml-config=' + __dirname + '/create_instance_example.yaml',
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTestYaml');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
				assert.equal(actual.opts['reassociate-eip'], true);
			});

			it('takes command line arguments ahead of YAML and JSON files', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--json-config=' + __dirname + '/create_instance_example.json',
						'--reassociate-eip=false',
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
				assert.equal(actual.opts['reassociate-eip'], false);
			});

			it('overrides files with command line', function(){
				let commands = ['create', 'instance'],
					opts = [
						'--json-config=' + __dirname + '/create_instance_example.json',
						'--instance-type=xxxxxxxxxxxTestOverride',
					];
				let actual = testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTestOverride');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
			});
		});

		describe('create instance', function(){
			let commands, opts;

			beforeEach(function(){
				require('yargs').reset();
				commands = ['create', 'instance'];
				opts = [
					'--az=a',
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
				assert.equal(actual.opts.ami, 'test_ami');
				assert.equal(actual.opts['instance-type'], 'xxxxxxxxxxxTest');
				assert.equal(actual.opts['ssh-key-pair'], 'mykeys');
				assert.equal(actual.opts['availability-zone'], 'q');
				assert.equal(actual.opts['vpc'], 'testVpc');
				assert.equal(actual.opts['regions'], 'us-east-1');
			});

			it('errors if missing args', function(){
				commands = ['create', 'instance'];
				opts = [
					'--z=a',
					'--ami=test_ami',
					'--instance-type=xxxxxxxxxxxTest',
				];
				let test_spy = sinon.spy(testee._validate_dependent_args);
				let actual = testee.parse_args(commands.concat(opts));
				assert.calledOnce(process.exit);
				assert.notCalled(test_spy);
			});

			it('errors if missing required envs', function(){
				opts.push('--required-env=rum');
				opts.push('--required-env=ale');

				testee.parse_args(commands.concat(opts));
				assert.calledOnce(process.exit);
				assert.match(Logger.error.args[0][0], /Missing required ENVs:/);
				assert.match(Logger.error.args[0][0], /rum/);
				assert.match(Logger.error.args[0][0], /ale/);
			});

			it('does no error if required envs are passed', function(){
				opts.push('--required-env=rum');
				opts.push('--required-env=ale');
				opts.push('--env=ale=good');
				opts.push('--env=rum=great');

				testee.parse_args(commands.concat(opts));
				assert.notCalled(process.exit);
			});
		});

	});

});
