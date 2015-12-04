'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');

var vpcs = {
  'us-east-1': 'vpc-47415125',
  'us-west-2': 'vpc-c08e67a5',
  'eu-west-1': 'vpc-13b62476'
};

function _do_create(region, asg_name, lc_name, instance_tags, error_topic){
  var AS = BB.promisifyAll(new AWS.AutoScaling({
    region: region,
    apiVersion: '2011-01-01'
  }));
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  // first, get a list of all subnets for our vpc in that region
  return EC2.describeSubnetsAsync({
    Filters: [{
      Name: 'vpc-id',
      Values: [vpcs[region]]
    }]
  })
  .then(function(subnets){
    var subnet_ids = subnets.Subnets.map(function(obj){return obj.SubnetId;});
    return subnet_ids;
  })
  // then, create an asg with those subnets
  .then(function(subnets){
    var tags;
    if(instance_tags) {
      console.log(`${region}: applying tags`);
      tags = instance_tags.map(function(tag_str){
        var kv = tag_str.split('=');
        return {
          Key: kv[0],
          Value: kv[1]
        }
      });
    }
    return AS.createAutoScalingGroupAsync({
      AutoScalingGroupName: asg_name,
      LaunchConfigurationName: lc_name,
      VPCZoneIdentifier: subnets.join(','),
      Tags: tags,
      TerminationPolicies: ['ClosestToNextInstanceHour'],
      // TODO i want the size to vary by region...
      MaxSize: 1,
      MinSize: 0,
      DesiredCapacity: 0,
      HealthCheckGracePeriod: 300
    });
  })
  // add notifications
  .then(function(asg){
    return AS.putNotificationConfigurationAsync({
      AutoScalingGroupName: asg_name,
      NotificationTypes: ['autoscaling:EC2_INSTANCE_LAUNCH_ERROR', 'autoscaling:EC2_INSTANCE_TERMINATE_ERROR'],
      TopicARN: `arn:aws:sns:${region}:117684984046:${error_topic}`
    }).then(function(){
      return AWSUtil.get_asg(AS,asg_name);
    });
  });
}

function create(regions, asg_name, lc_name, instance_tags, error_topic){
  var region_promises = regions.map(function(region){
    return _do_create(region, asg_name, lc_name, instance_tags, error_topic);
  });
  return BB.all(region_promises);
}

module.exports = create;
