'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

function _get_ec2(region) {
	return BB.promisifyAll(new AWS.EC2({
		region: region,
		apiVersion: '2015-10-01'
	}));
}

function _get_as(region) {
	return BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
}

exports.get_ec2 = _get_ec2;
exports.get_as = _get_as;
