'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');

function _get_asg(as, asg_name) {
  return as.describeAutoScalingGroupsAsync({
    AutoScalingGroupNames: [asg_name]
  }).then(function(data){
    return data.AutoScalingGroups[0];
  });
}

function _get_sg_id(region, group_name) {
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  return EC2.describeSecurityGroupsAsync({
    DryRun: false,
    Filters: [
      {
        Name: 'group-name',
        Values: [group_name]
      }
    ]
  }).then(function(result){
    return result.SecurityGroups[0].GroupId;
  });
}

exports.get_asg = _get_asg;
exports.get_sg_id = _get_sg_id;
