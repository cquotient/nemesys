'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const SGUtil = require('./sg_util');

function _get_sg_rules(ec2, sg_id) {
	return ec2.describeSecurityGroupsAsync({
		DryRun: false,
		GroupIds: [sg_id]
	}).then(function(result){
		return result.SecurityGroups[0].IpPermissions;
	});
}

function _get_rule_strings(api_rules) {
	return api_rules.reduce(function(prev, curr){
		let port_range = curr.FromPort === curr.ToPort ? curr.ToPort : `${curr.FromPort}-${curr.ToPort}`;
		if(curr.UserIdGroupPairs) {
			prev = prev.concat(curr.UserIdGroupPairs.map((rule) => [rule.GroupId, port_range, curr.IpProtocol].join(':')));
		}
		if(curr.IpRanges) {
			prev = prev.concat(curr.IpRanges.map((rule) => [rule.CidrIp, port_range, curr.IpProtocol].join(':')));
		}
		return prev;
	}, []);
}

function _do_replace(region, sg_name, ingress) {
	let EC2 = AWSProvider.get_ec2(region);
	return AWSUtil.get_sg_id(region, sg_name)
	.then(function(sg_id) {
		Logger.info(`${region}: found security group ${sg_name} (${sg_id})`);
		return _get_sg_rules(EC2, sg_id)
		.then(function(sg_rules) {
			Logger.info(`${region}: ${sg_name} has ${sg_rules.length} rule(s)`);
			return SGUtil.get_ip_permissions(region, ingress)
			.then(function(ip_perms){
				let existing_rules = _get_rule_strings(sg_rules);
				let new_rules = _get_rule_strings(ip_perms);
				let rules_to_add = [];
				for(let i=0; i<new_rules.length; i++) {
					if(existing_rules.indexOf(new_rules[i]) === -1) {
						rules_to_add.push(ip_perms[i]);
					}
				}
				let rules_to_delete = [];
				for(let i=0; i<existing_rules.length; i++) {
					if(new_rules.indexOf(existing_rules[i]) === -1) {
						rules_to_delete.push(existing_rules[i]);
					}
				}
				return SGUtil.get_ip_permissions(region, rules_to_delete, true).then(function(formatted_deletes){
					return {
						to_add: rules_to_add,
						to_delete: formatted_deletes
					};
				});
			});
		}).then(function(add_delete){
			if(add_delete.to_add.length === 0 && add_delete.to_delete.length === 0) {
				Logger.info(`${region}: no changes to make`);
				return Promise.resolve();
			}
			let promises = [];
			if(add_delete.to_add.length > 0) {
				Logger.info(`${region}: adding ${add_delete.to_add.length} rule(s)`);
				promises.push(EC2.authorizeSecurityGroupIngressAsync({
					DryRun: false,
					GroupId: sg_id,
					IpPermissions: add_delete.to_add
				}));
			}
			if(add_delete.to_delete.length > 0) {
				Logger.info(`${region}: removing ${add_delete.to_delete.length} rule(s)`);
				promises.push(EC2.revokeSecurityGroupIngressAsync({
					DryRun: false,
					GroupId: sg_id,
					IpPermissions: add_delete.to_delete
				}));
			}
			return Promise.all(promises);
		});
	});
}

function _replace(regions, sg_name, ingress) {
	let region_promises = regions.map(function(region){
		return _do_replace(region, sg_name, ingress);
	});
	return BB.all(region_promises);
}

module.exports = _replace;
