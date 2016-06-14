'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');

function _do_delete(region, lc_name, spot) {
	var AS = BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
	var proms = [AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name})];
	if(spot) {
		proms.push(AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name + '_spot'}));
	}
	return BB.all(proms);
}

function _delete(regions, lc_name, spot){
	var region_promises = regions.map(function(region){
		return _do_delete(region, lc_name, spot);
	});
	return BB.all(region_promises);
}

module.exports = _delete;
