'use strict';

const nemesys = require('../');

const Logger = require('./logger');

function _handle_create(cmd) {
	switch(cmd.target) {

		case 'asg':
			let optional = {
				min: cmd.opts['min-instance-count'],
				max: cmd.opts['max-instance-count'],
				desired: cmd.opts['desired-instance-count']
			};
			nemesys.asg.create(
				cmd.opts['regions'],
				cmd.opts['vpc'],
				cmd.opts['group'],
				cmd.opts['launch-config'],
				cmd.opts['instance-tags'],
				cmd.opts['error-topic'],
				cmd.opts['availability-zones'],
				optional
			).then(function(){
				Logger.info('create complete');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;

		case 'sg':
			nemesys.sg.create(
				cmd.opts['regions'],
				cmd.opts['vpc'],
				cmd.opts['security-group'],
				cmd.opts['description'],
				cmd.opts['ingress-rules']
			).then(function(){
				Logger.info('created security group');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;

		case 'lc':
			nemesys.lc.create(
				cmd.opts['regions'],
				cmd.opts['launch-config'],
				cmd.opts['ami'],
				cmd.opts['instance-type'],
				cmd.opts['ssh-key-pair'],
				cmd.opts['security-groups'],
				cmd.opts['iam-role'],
				cmd.opts['user-data-files'],
				cmd.opts['region-user-data'],
				cmd.opts['disks'],
				cmd.opts['clone-spot-price']
			).then(function(){
				Logger.info('created launch configuration');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;

		case 'instance':
			nemesys.instance.create(
				cmd.opts['regions'],
				cmd.opts['vpc'],
				cmd.opts['ami'],
				cmd.opts['instance-type'],
				cmd.opts['ssh-key-pair'],
				cmd.opts['security-groups'],
				cmd.opts['iam-role'],
				cmd.opts['user-data-files'],
				cmd.opts['region-user-data'],
				null, //raw userdata string not supported from command line atm
				cmd.opts['disks'],
				cmd.opts['availability-zone'],
				cmd.opts['tags'],
				cmd.opts['network-interface'],
				cmd.opts['env'],
				cmd.opts['optimize-ebs']
			).then(function(){
				Logger.info('created instance');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;

		case 'ami':
			nemesys.ami.create(
				cmd.opts['regions'],
				cmd.opts['ami'],
				cmd.opts['vpc'],
				cmd.opts['base-ami'],
				cmd.opts['instance-type'],
				cmd.opts['ssh-key-pair'],
				cmd.opts['security-groups'],
				cmd.opts['iam-role'],
				cmd.opts['user-data-files'],
				cmd.opts['region-user-data'],
				cmd.opts['disks'],
				cmd.opts['availability-zone'],
				cmd.opts['preserve-instance']
			).then(function(){
				Logger.info('created ami');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;

		default:
			Logger.info(`Unrecognized command: ${cmd.command} ${cmd.target}`);
			process.exit(1);
	}
}

function _handle_delete(argv) {
	switch(argv.target) {
		case 'asg':
			nemesys.asg.delete(
				argv['regions'],
				argv['group']
			).then(function(){
				Logger.info('deleted autoscaling group');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'lc':
			nemesys.lc.delete(
				argv['regions'],
				argv['launch-config'],
				argv['delete-spot-clone']
			).then(function(){
				Logger.info('deleted launch config');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'sg':
			nemesys.sg.delete(
				argv['regions'],
				argv['security-group']
			).then(function(){
				Logger.info('deleted security group');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'ami':
			nemesys.ami.delete(
				argv['regions'],
				argv['ami']
			).then(function(){
				Logger.info('deleted ami');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			Logger.info(`Unrecognized command: ${argv.command} ${argv.target}`);
			process.exit(1);
	}
}

function _handle_replace(argv) {
	switch(argv.target) {
		case 'asg':
			nemesys.asg.replace(
				argv['regions'],
				argv['vpc'],
				argv['old-group'],
				argv['group'],
				argv['launch-config']
			).then(function(){
				Logger.info('replace complete');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'sg':
			nemesys.sg.replace(
				argv['regions'],
				argv['security-group'],
				argv['ingress-rules']
			).then(function(){
				Logger.info('replace complete');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			Logger.info(`Unrecognized command: ${argv.command} ${argv.target}`);
			process.exit(1);
	}
}

function _handle_update(argv) {
	switch(argv.target) {
		case 'asg':
			nemesys.asg.update(
				argv['regions'],
				argv['group'],
				argv['launch-config']
			).then(function(){
				Logger.info('update complete');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'sg':
			nemesys.sg.update(
				argv['regions'],
				argv['security-group'],
				argv['ingress-rules'],
				argv['remove']
			).then(function(){
				Logger.info('updated security group');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			Logger.info(`Unrecognized command: ${argv.command} ${argv.target}`);
			process.exit(1);
	}
}


function _handle(argv) {
	switch(argv.command) {
		case 'update':
			_handle_update(argv);
			break;

		case 'create':
			_handle_create(argv);
			break;

		case 'replace':
			_handle_replace(argv);
			break;

		case 'delete':
			_handle_delete(argv);
			break;

		default:
			Logger.info(`Unrecognized command: ${argv.command}`);
			process.exit(1);
	}
}

exports.handle = _handle;
