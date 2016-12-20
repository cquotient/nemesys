'use strict';

let BB = require('bluebird');
let AWS = require('aws-sdk');

let AWSUtil = require('../aws_util');

function _do_delete(region, sg_name) {
	return AWSUtil.get_sg_id(region, sg_name)
	.then(function(sg_id) {
		console.log(`${region}: deleting security group ${sg_name} (${sg_id})`);
		let EC2 = BB.promisifyAll(new AWS.EC2({
			region: region,
			apiVersion: '2015-10-01'
		}));
		return EC2.deleteSecurityGroupAsync({
			DryRun: false,
			GroupId: sg_id
		});
	});
}

function _delete(regions, sg_name) {
	let region_promises = regions.map(function(region){
		return _do_delete(region, sg_name);
	});
	return BB.all(region_promises);
}

module.exports = _delete;
