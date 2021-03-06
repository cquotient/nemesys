'use strict';

const AWS = require('aws-sdk');
const BB = require('bluebird');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');
const SGUtil = require('./sg_util');

function _do_create(region, vpc_name, sg_name, desc, ingress) {
	if(!desc) desc = sg_name;
	let EC2 = BB.promisifyAll(new AWS.EC2({
		region: region,
		apiVersion: '2015-10-01'
	}));
	return AWSUtil.get_vpc_id(region, vpc_name)
	.then(function(vpc_id){
		return EC2.createSecurityGroupAsync({
			Description: desc,
			GroupName: sg_name,
			DryRun: false,
			VpcId: vpc_id
		});
	})
	.then(function(result){
		Logger.info(`${region}: created security group ${sg_name} (${result.GroupId})`);
		if(ingress && ingress.length > 0) {
			return SGUtil.get_ip_permissions(region, ingress)
			.then(function(ip_perms){
				return EC2.authorizeSecurityGroupIngressAsync({
					DryRun: false,
					GroupId: result.GroupId,
					IpPermissions: ip_perms
				});
			})
			.then(function(){
				Logger.info(`${region}: successfully applied ${ingress.length} sg ingress rules to ${sg_name}`);
			});
		}
	});
}

function _create(regions, vpc_name, sg_name, desc, ingress) {
	let region_promises = regions.map(function(region){
		return _do_create(region, vpc_name, sg_name, desc, ingress);
	});
	return BB.all(region_promises);
}

module.exports = _create;
