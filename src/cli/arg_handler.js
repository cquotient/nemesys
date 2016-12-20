'use strict';

const nemesys = require('../');

function _handle_create(argv) {
	switch(argv.target) {

		case 'asg':
			let optional = {
				min: argv['min-instance-count'],
				max: argv['max-instance-count'],
				desired: argv['desired-instance-count']
			};
			nemesys.asg.create(
				argv['regions'],
				argv['vpc'],
				argv['group'],
				argv['launch-config'],
				argv['instance-tags'],
				argv['error-topic'],
				argv['availability-zones'],
				optional
			).then(function(){
				console.log('create complete');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;

		case 'sg':
			nemesys.sg.create(
				argv['regions'],
				argv['vpc'],
				argv['security-group'],
				argv['description'],
				argv['ingress-rules']
			).then(function(){
				console.log('created security group');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;

		case 'lc':
			nemesys.lc.create(
				argv['regions'],
				argv['launch-config'],
				argv['ami'],
				argv['instance-type'],
				argv['ssh-key-pair'],
				argv['security-groups'],
				argv['iam-role'],
				argv['user-data-files'],
				argv['region-user-data'],
				argv['disks'],
				argv['clone-spot-price']
			).then(function(){
				console.log('created launch configuration');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;

		case 'instance':
			nemesys.instance.create(
				argv['regions'],
				argv['vpc'],
				argv['ami'],
				argv['instance-type'],
				argv['ssh-key-pair'],
				argv['security-groups'],
				argv['iam-role'],
				argv['user-data-files'],
				argv['region-user-data'],
				null, //raw userdata string not supported from command line atm
				argv['disks'],
				argv['availability-zone'],
				argv['tags'],
				argv['network-interface'],
				argv['env'],
				argv['optimize-ebs']
			).then(function(){
				console.log('created instance');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;

		case 'ami':
			nemesys.ami.create(
				argv['regions'],
				argv['ami'],
				argv['vpc'],
				argv['base-ami'],
				argv['instance-type'],
				argv['ssh-key-pair'],
				argv['security-groups'],
				argv['iam-role'],
				argv['user-data-files'],
				argv['region-user-data'],
				argv['disks'],
				argv['availability-zone'],
				argv['preserve-instance']
			).then(function(){
				console.log('created ami');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;

		default:
			console.log(`Unrecognized command: ${argv.command} ${argv.target}`);
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
				console.log('deleted autoscaling group');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		case 'lc':
			nemesys.lc.delete(
				argv['regions'],
				argv['launch-config'],
				argv['delete-spot-clone']
			).then(function(){
				console.log('deleted launch config');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		case 'sg':
			nemesys.sg.delete(
				argv['regions'],
				argv['security-group']
			).then(function(){
				console.log('deleted security group');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		case 'ami':
			nemesys.ami.delete(
				argv['regions'],
				argv['ami']
			).then(function(){
				console.log('deleted ami');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			console.log(`Unrecognized command: ${argv.command} ${argv.target}`);
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
				console.log('replace complete');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		case 'sg':
			nemesys.sg.replace(
				argv['regions'],
				argv['security-group'],
				argv['ingress-rules']
			).then(function(){
				console.log('replace complete');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			console.log(`Unrecognized command: ${argv.command} ${argv.target}`);
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
				console.log('update complete');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
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
				console.log('updated security group');
				process.exit(0);
			}).catch(function(err){
				console.error(err.stack);
				process.exit(1);
			});
			break;
		default:
			console.log(`Unrecognized command: ${argv.command} ${argv.target}`);
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
			console.log(`Unrecognized command: ${argv.command}`);
			process.exit(1);
	}
}

exports.handle = _handle;
