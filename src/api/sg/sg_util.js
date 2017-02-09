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
		let potential_ip_parts = parts[0].split('/');
		if(!potential_ip_parts[1]) {
			potential_ip_parts[1] = '32'; //CIDR bit mask
		}
		if(validator.isIP(potential_ip_parts[0]) || parts[0] === '0.0.0.0/0') {
			let protocol = parts[2] ? parts[2] : 'tcp';
			let port_range = parts[1].split('-');
			perms.push(Promise.resolve({
				FromPort: +port_range[0],
				ToPort: +(port_range[1] || port_range[0]),
				IpProtocol: protocol,
				IpRanges: [
					{
						CidrIp: potential_ip_parts.join('/')
					}
				]
			}));
		} else if(potential_ip_parts[0] === 'me') {
			let protocol = parts[2] ? parts[2] : 'tcp';
			let port_range = parts[1].split('-');
			let my_ip_promise = _get_my_ip().then(function(my_ip){
				return {
					FromPort: +port_range[0],
					ToPort: +(port_range[1] || port_range[0]),
					IpProtocol: protocol,
					IpRanges: [
						{
							CidrIp: `${my_ip}/${potential_ip_parts[1]}`
						}
					]
				};
			});
			perms.push(my_ip_promise);
		} else {
			groups_to_lookup.push(obj);
		}
	});

	if(groups_to_lookup.length > 0) {
		groups_to_lookup.forEach(function(obj){
			let parts = obj.split(':');
			let protocol = parts[2] ? parts[2] : 'tcp';
			let port_range = parts[1].split('-');
			if(groups_are_ids) {
				perms.push(Promise.resolve({
					FromPort: +port_range[0],
					ToPort: +(port_range[1] || port_range[0]),
					IpProtocol: protocol,
					UserIdGroupPairs: [
						{
							GroupId: parts[0]
						}
					]
				}));
			} else {
				return perms.push(AWSUtil.get_sg_id(region, parts[0])
				.then(function(group_id) {
					return {
						FromPort: +port_range[0],
						ToPort: +(port_range[1] || port_range[0]),
						IpProtocol: protocol,
						UserIdGroupPairs: [
							{
								GroupId: group_id
							}
						]
					};
				}));
			}
		});
	}
	return BB.all(perms);
}

function _get_my_ip() {
	return new Promise(function(resolve, reject){
		let body = '';
		require('https').get('https://ipv4.icanhazip.com/', function(resp){
			resp.on('data', function (chunk) {
				body += chunk;
			});
			resp.on('end', function () {
				resolve(body);
			});
		}).on('error', reject);
	});
}

exports.get_ip_permissions = _get_ip_permissions;
