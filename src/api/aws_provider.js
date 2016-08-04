'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

function _get_ec2(region) {
	return BB.promisifyAll(new AWS.EC2({
		region: region,
		apiVersion: '2015-10-01'
	}));
}

exports.get_ec2 = _get_ec2;
