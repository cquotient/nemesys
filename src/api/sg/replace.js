'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');

var AWSProvider = require('../aws_provider');
var AWSUtil = require('../aws_util');
var SGUtil = require('./sg_util');

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
		if(curr.UserIdGroupPairs) {
			prev = prev.concat(curr.UserIdGroupPairs.map((rule) => [rule.GroupId, curr.ToPort, curr.IpProtocol].join(':')));
		}
		if(curr.IpRanges) {
			prev = prev.concat(curr.IpRanges.map((rule) => [rule.CidrIp, curr.ToPort, curr.IpProtocol].join(':')));
		}
		return prev;
	}, []);
}

function _do_replace(region, sg_name, ingress) {
	var EC2 = AWSProvider.get_ec2(region);
	return AWSUtil.get_sg_id(region, sg_name)
	.then(function(sg_id) {
		console.log(`${region}: found security group ${sg_name} (${sg_id})`);
		return _get_sg_rules(EC2, sg_id)
		.then(function(sg_rules) {
			console.log(`${region}: ${sg_name} has ${sg_rules.length} rule(s)`);
			return SGUtil.get_ip_permissions(region, ingress)
			.then(function(ip_perms){
				var existing_rules = _get_rule_strings(sg_rules);
				var new_rules = _get_rule_strings(ip_perms);
				var rules_to_add = [];
				for(let i=0; i<new_rules.length; i++) {
					if(existing_rules.indexOf(new_rules[i]) === -1) {
						rules_to_add.push(ip_perms[i]);
					}
				}
				var rules_to_delete = [];
				for(let i=0; i<existing_rules.length; i++) {
					if(new_rules.indexOf(existing_rules[i]) === -1) {
						if(sg_rules[i].UserIdGroupPairs.length === 0) {
							delete sg_rules[i].UserIdGroupPairs;
						}
						if(sg_rules[i].IpRanges.length === 0) {
							delete sg_rules[i].IpRanges;
						}
						if(sg_rules[i].PrefixListIds.length === 0) {
							delete sg_rules[i].PrefixListIds;
						}
						rules_to_delete.push(sg_rules[i]);
					}
				}
				return {
					to_add: rules_to_add,
					to_delete: rules_to_delete
				};
			});
		}).then(function(add_delete){
			if(add_delete.to_add.length === 0 && add_delete.to_delete.length === 0) {
				console.log(`${region}: no changes to make`);
				return Promise.resolve();
			}
			var promises = [];
			if(add_delete.to_add.length > 0) {
				console.log(`${region}: adding ${add_delete.to_add.length} rule(s)`);
				promises.push(EC2.authorizeSecurityGroupIngressAsync({
					DryRun: false,
					GroupId: sg_id,
					IpPermissions: add_delete.to_add
				}));
			}
			if(add_delete.to_delete.length > 0) {
				console.log(`${region}: removing ${add_delete.to_delete.length} rule(s)`);
				promises.push(EC2.revokeSecurityGroupIngressAsync({
					DryRun: false,
					GroupId: sg_id,
					IpPermissions: add_delete.to_delete
				}));
			}
			return Promise.all(promises)
		});
	});
}

function _replace(regions, sg_name, ingress) {
	var region_promises = regions.map(function(region){
		return _do_replace(region, sg_name, ingress);
	});
	return BB.all(region_promises);
}

module.exports = _replace;
