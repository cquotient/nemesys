'use strict';

const BB = require('bluebird');
const AWS = require('aws-sdk');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');
const SGUtil = require('./sg_util');

function _do_update(region, sg_name, ingress, should_remove) {
	return AWSUtil.get_sg_id(region, sg_name)
	.then(function(sg_id) {
		Logger.info(`${region}: updating security group ${sg_name} (${sg_id})`);
		if(ingress && ingress.length > 0) {
			if(should_remove) {
				Logger.info(`${region}: removing ${ingress.length} ingress rules`);
				return SGUtil.get_ip_permissions(region, ingress)
				.then(function(ip_perms){
					let EC2 = BB.promisifyAll(new AWS.EC2({
						region: region,
						apiVersion: '2015-10-01'
					}));
					return EC2.revokeSecurityGroupIngressAsync({
						DryRun: false,
						GroupId: sg_id,
						IpPermissions: ip_perms
					});
				})
				.then(function(){
					Logger.info(`${region}: successfully removed ${ingress.length} sg ingress rules from ${sg_name}`);
				});
			} else {
				Logger.info(`${region}: adding ${ingress.length} ingress rules`);
				return SGUtil.get_ip_permissions(region, ingress)
				.then(function(ip_perms){
					let EC2 = BB.promisifyAll(new AWS.EC2({
						region: region,
						apiVersion: '2015-10-01'
					}));
					return EC2.authorizeSecurityGroupIngressAsync({
						DryRun: false,
						GroupId: sg_id,
						IpPermissions: ip_perms
					});
				})
				.then(function(){
					Logger.info(`${region}: successfully added ${ingress.length} sg ingress rules to ${sg_name}`);
				});
			}
		}
	});
}

function _update(regions, sg_name, ingress, should_remove) {
	let region_promises = regions.map(function(region){
		return _do_update(region, sg_name, ingress, should_remove);
	});
	return BB.all(region_promises);
}

module.exports = _update;
