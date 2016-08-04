'use strict';

var BB = require('bluebird');
var validator = require('validator');

var AWSUtil = require('../aws_util');

function _get_ip_permissions(region, ingress) {
	var perms = [],
			groups_to_lookup = [];
	ingress.forEach(function(obj){
		var parts = obj.split(':');
		if(validator.isIP(parts[0].split('/')[0]) || parts[0] === '0.0.0.0/0') {
			var protocol = parts[2] ? parts[2] : 'tcp';
			var port_range = parts[1].split('-');
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
		var group_id_proms = groups_to_lookup.map(function(obj){
			var parts = obj.split(':');
			return AWSUtil.get_sg_id(region, parts[0])
			.then(function(group_id) {
				var protocol = parts[2] ? parts[2] : 'tcp';
				var port_range = parts[1].split('-');
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
