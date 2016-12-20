'use strict';

let AWS = require('aws-sdk');
let BB = require('bluebird');

function _do_delete(region, lc_name, spot) {
	let AS = BB.promisifyAll(new AWS.AutoScaling({
		region: region,
		apiVersion: '2011-01-01'
	}));
	let proms = [AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name})];
	if(spot) {
		proms.push(AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name + '_spot'}));
	}
	return BB.all(proms);
}

function _delete(regions, lc_name, spot){
	let region_promises = regions.map(function(region){
		return _do_delete(region, lc_name, spot);
	});
	return BB.all(region_promises);
}

module.exports = _delete;
