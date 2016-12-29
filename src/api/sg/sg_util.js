'use strict';

const BB = require('bluebird');
const validator = require('validator');

const AWSUtil = require('../aws_util');

function _get_ip_permissions(region, ingress, groups_are_ids) {
	let perms = [],
			groups_to_lookup = [];
	ingress.forEach(function(obj){
		let parts = obj.split(':');
		//apply some defaults
		if(!parts[1]) {
			parts[1] = '22';
		}
		if(validator.isIP(parts[0].split('/')[0]) || parts[0] === '0.0.0.0/0') {
			let protocol = parts[2] ? parts[2] : 'tcp';
			let port_range = parts[1].split('-');
			perms.push({
				FromPort: +port_range[0],
				ToPort: +(port_range[1] || port_range[0]),
				IpProtocol: protocol,
				IpRanges: [
					{
						CidrIp: parts[0]
					}
				]
			});
		} else {
			groups_to_lookup.push(obj);
		}
	});

	if(groups_to_lookup.length > 0) {
		let group_id_proms = groups_to_lookup.map(function(obj){
			let parts = obj.split(':');
			let protocol = parts[2] ? parts[2] : 'tcp';
			let port_range = parts[1].split('-');
			if(groups_are_ids) {
				perms.push({
					FromPort: +port_range[0],
					ToPort: +(port_range[1] || port_range[0]),
					IpProtocol: protocol,
					UserIdGroupPairs: [
						{
							GroupId: parts[0]
						}
					]
				});
				return Promise.resolve();
			} else {
				return AWSUtil.get_sg_id(region, parts[0])
				.then(function(group_id) {
					perms.push({
						FromPort: +port_range[0],
						ToPort: +(port_range[1] || port_range[0]),
						IpProtocol: protocol,
						UserIdGroupPairs: [
							{
								GroupId: group_id
							}
						]
					});
				});
			}
		});
		return BB.all(group_id_proms)
		.then(function(){
			return perms;
		});
	} else {
		return Promise.resolve(perms);
	}
}

exports.get_ip_permissions = _get_ip_permissions;
