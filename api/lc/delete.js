'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');

function _do_delete(region, lc_name, spot) {
  var AS = BB.promisifyAll(new AWS.AutoScaling({
    region: region,
    apiVersion: '2011-01-01'
  }));
  return BB.all([
    AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name}),
    AS.deleteLaunchConfigurationAsync({LaunchConfigurationName: lc_name + '_spot'})
  ]);
}

function _delete(regions, lc_name, spot){
  var region_promises = regions.map(function(region){
    return _do_delete(region, lc_name, spot);
  });
  return BB.all(region_promises);
}

module.exports = _delete;
