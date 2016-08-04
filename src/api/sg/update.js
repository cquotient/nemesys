'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');
var SGUtil = require('./sg_util');

function _do_update(region, sg_name, ingress, should_remove) {
	return AWSUtil.get_sg_id(region, sg_name)
	.then(function(sg_id) {
		console.log(`${region}: updating security group ${sg_name} (${sg_id})`);
		if(ingress && ingress.length > 0) {
			if(should_remove) {
				console.log(`${region}: removing ${ingress.length} ingress rules`);
				return SGUtil.get_ip_permissions(region, ingress)
				.then(function(ip_perms){
					var EC2 = BB.promisifyAll(new AWS.EC2({
						region: region,
						apiVersion: '2015-10-01'
					}));
					return EC2.revokeSecurityGroupIngressAsync({
						DryRun: false,
						GroupId: sg_id,
						IpPermissions: ip_perms
					});
				})
				.then(function(result){
					console.log(`${region}: successfully removed ${ingress.length} sg ingress rules from ${sg_name}`);
				});
			} else {
				console.log(`${region}: adding ${ingress.length} ingress rules`);
				return SGUtil.get_ip_permissions(region, ingress)
				.then(function(ip_perms){
					var EC2 = BB.promisifyAll(new AWS.EC2({
						region: region,
						apiVersion: '2015-10-01'
					}));
					return EC2.authorizeSecurityGroupIngressAsync({
						DryRun: false,
						GroupId: sg_id,
						IpPermissions: ip_perms
					});
				})
				.then(function(result){
					console.log(`${region}: successfully added ${ingress.length} sg ingress rules to ${sg_name}`);
				});
			}
		}
	});
}

function _update(regions, sg_name, ingress, should_remove) {
	var region_promises = regions.map(function(region){
		return _do_update(region, sg_name, ingress, should_remove);
	});
	return BB.all(region_promises);
}

module.exports = _update;