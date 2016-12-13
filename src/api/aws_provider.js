'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var ec2_conns = {};

function _get_ec2(region) {
	if(!ec2_conns[region]) {
		ec2_conns[region] = BB.promisifyAll(new AWS.EC2({
			region: region,
			apiVersion: '2015-10-01'
		}));
	}
	return ec2_conns[region];
}

function _get_as(region) {
	return BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
}

function _get_iam() {
	return BB.promisifyAll(new AWS.IAM({
		apiVersion: '2010-05-08'
	}));
}

function _get_cloudwatch(region) {
	return BB.promisifyAll(new AWS.CloudWatch({
		region: region,
		apiVersion: '2010-08-01'
	}));
}

exports.get_ec2 = _get_ec2;
exports.get_as = _get_as;
exports.get_iam = _get_iam;
exports.get_cw = _get_cloudwatch;
