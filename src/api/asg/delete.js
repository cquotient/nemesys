'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

function _do_delete(region, asg_name) {
	var AS = BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
	return AS.deleteAutoScalingGroupAsync({
		AutoScalingGroupName: asg_name
	});
}

function _delete(regions, asg_name) {
	var region_promises = regions.map(function(region){
		return _do_delete(region, asg_name);
	});
	return BB.all(region_promises);
}

module.exports = _delete;
