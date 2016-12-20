'use strict';

const BB = require('bluebird');
const AWS = require('aws-sdk');

function _do_delete(region, asg_name) {
	let AS = BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
	return AS.deleteAutoScalingGroupAsync({
		AutoScalingGroupName: asg_name
	});
}

function _delete(regions, asg_name) {
	let region_promises = regions.map(function(region){
		return _do_delete(region, asg_name);
	});
	return BB.all(region_promises);
}

module.exports = _delete;
