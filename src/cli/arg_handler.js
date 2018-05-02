'use strict';

const nemesys = require('../');

const Logger = require('../logger');

function _handle_create(cmd) {
	switch(cmd.target) {

		case 'asg':
			let optional = {
				min: cmd.opts['min-instance-count'],
				max: cmd.opts['max-instance-count'],
				desired: cmd.opts['desired-instance-count'],
				elb_name: cmd.opts['elb-name']
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

		case 'alb':
			if (typeof cmd.opts['target-groups'] === 'string') {
				cmd.opts['target-groups'] = JSON.parse(cmd.opts['target-groups']);
			}
			if (typeof cmd.opts['ssl-config'] === 'string') {
				cmd.opts['ssl-config'] = JSON.parse(cmd.opts['ssl-config']);
			}
			if (typeof cmd.opts['options'] === 'string') {
				cmd.opts['options'] = JSON.parse(cmd.opts['options']);
			}
			nemesys.alb.create(
				cmd.opts['regions'],
				cmd.opts['vpc'],
				cmd.opts['security-group'],
				cmd.opts['name'],
				cmd.opts['target-groups'],
				cmd.opts['ssl-config'],
				cmd.opts['options'] || {}
			).then(function(){
				Logger.info('create ALB complete');
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
				cmd.opts['region-user-data'] || [], //yargs default breaks merging command line args w/ config file, so do it here
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
				cmd.opts['region-user-data'] || [], //yargs default breaks merging command line args w/ config file, so do it here
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
				cmd.opts['region-user-data'] || [], //yargs default breaks merging command line args w/ config file, so do it here
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

function _handle_delete(cmd) {
	switch(cmd.target) {
		case 'asg':
			nemesys.asg.delete(
				cmd.opts['regions'],
				cmd.opts['group']
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
				cmd.opts['regions'],
				cmd.opts['launch-config'],
				cmd.opts['delete-spot-clone']
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
				cmd.opts['regions'],
				cmd.opts['security-group']
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
				cmd.opts['regions'],
				cmd.opts['ami']
			).then(function(){
				Logger.info('deleted ami');
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

function _handle_replace(cmd) {
	switch(cmd.target) {
		case 'asg':
			nemesys.asg.replace(
				cmd.opts['regions'],
				cmd.opts['vpc'],
				cmd.opts['old-group'],
				cmd.opts['group'],
				cmd.opts['launch-config']
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
				cmd.opts['regions'],
				cmd.opts['security-group'],
				cmd.opts['ingress-rules']
			).then(function(){
				Logger.info('replace complete');
				process.exit(0);
			}).catch(function(err){
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		case 'instance':
			nemesys.instance.replace(
				cmd.opts['regions'],
				cmd.opts['target'],
				cmd.opts['source']
			).then(function () {
				Logger.info('replace complete');
				process.exit(0);
			}).catch(function (err) {
				Logger.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			Logger.info(`Unrecognized command: ${cmd.command} ${cmd.target}`);
			process.exit(1);
	}
}

function _handle_update(cmd) {
	switch(cmd.target) {
		case 'asg':
			nemesys.asg.update(
				cmd.opts['regions'],
				cmd.opts['group'],
				cmd.opts['launch-config']
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
				cmd.opts['regions'],
				cmd.opts['security-group'],
				cmd.opts['ingress-rules'],
				cmd.opts['remove']
			).then(function(){
				Logger.info('updated security group');
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

function _handle_copy(cmd) {
	switch(cmd.target) {
		case 'instance':
			nemesys.instance.copy(
				cmd.opts['regions'],
				cmd.opts['instance'],
				cmd.opts['rename'],
				// Copy supports all parameters supported by 'create'
				cmd.opts['vpc'],
				cmd.opts['ami'],
				cmd.opts['instance-type'],
				cmd.opts['ssh-key-pair'],
				cmd.opts['security-groups'],
				cmd.opts['iam-role'],
				cmd.opts['user-data-files'],
				cmd.opts['region-user-data'] || [], //yargs default breaks merging command line args w/ config file, so do it here
				null, //raw userdata string not supported from command line atm
				cmd.opts['disks'],
				cmd.opts['availability-zone'],
				cmd.opts['tags'],
				cmd.opts['network-interface'],
				cmd.opts['env'],
				cmd.opts['optimize-ebs']
			).then(function (id) {
				Logger.info(`copied instance to ${id}`);
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

function _handle(cmd) {
	switch(cmd.command) {
		case 'update':
			_handle_update(cmd);
			break;

		case 'create':
			_handle_create(cmd);
			break;

		case 'replace':
			_handle_replace(cmd);
			break;

		case 'delete':
			_handle_delete(cmd);
			break;

		case 'copy':
			_handle_copy(cmd);
			break;

		default:
			Logger.info(`Unrecognized command: ${cmd.command}`);
			process.exit(1);
	}
}

exports.handle = _handle;
