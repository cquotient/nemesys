'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');

function _apply_default_options(optional) {
  optional = optional || {};
  if(!optional.min) optional.min = 0;
  if(!optional.max) optional.max = 1;
  if(!optional.desired) optional.desired = 0;
  if(!optional.hc_grace) optional.hc_grace = 300;
  return optional;
}

function _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, optional){
  optional = _apply_default_options(optional);
  var AS = BB.promisifyAll(new AWS.AutoScaling({
    region: region,
    apiVersion: '2011-01-01'
  }));
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  // first, get a list of all subnets for our vpc in that region
  return AWSUtil.get_vpc_id(region, vpc_name)
  .then(function(vpc_id) {
    console.log(`${region}: found vpc ${vpc_id}`);
    return EC2.describeSubnetsAsync({
      Filters: [{
        Name: 'vpc-id',
        Values: [vpc_id]
      }]
    })
  })
  .then(function(subnets){
    console.log(`${region}: found ${subnets.Subnets.length} subnets`);
    var subnet_ids = subnets.Subnets.map(function(obj){return obj.SubnetId;});
    return subnet_ids;
  })
  // then, create an asg with those subnets
  .then(function(subnets){
    var tags;
    var create_params = {
      AutoScalingGroupName: asg_name,
      LaunchConfigurationName: lc_name,
      VPCZoneIdentifier: subnets.join(','),
      TerminationPolicies: ['ClosestToNextInstanceHour'],
      // TODO i want the size to vary by region...
      MinSize: optional.min,
      MaxSize: optional.max,
      DesiredCapacity: optional.desired,
      HealthCheckGracePeriod: optional.hc_grace
    };
    if(instance_tags) {
      console.log(`${region}: applying tags`);
      var tags = instance_tags.map(function(tag_str){
        var kv = tag_str.split('=');
        return {
          Key: kv[0],
          Value: kv[1]
        }
      });
      create_params.Tags = tags;
    }
    if(optional.elb_name) {
      create_params.LoadBalancerNames = [ optional.elb_name ];
      create_params.HealthCheckType = 'ELB';
    }
    return AS.createAutoScalingGroupAsync(create_params);
  })
  // add notifications
  .then(function(asg){
    if(error_topic) {
      console.log(`${region}: adding notification for topic ${error_topic}`);
      return AS.putNotificationConfigurationAsync({
        AutoScalingGroupName: asg_name,
        NotificationTypes: ['autoscaling:EC2_INSTANCE_LAUNCH_ERROR', 'autoscaling:EC2_INSTANCE_TERMINATE_ERROR'],
        TopicARN: `arn:aws:sns:${region}:117684984046:${error_topic}`
      }).then(function(){
        return AWSUtil.get_asg(AS,asg_name);
      });
    } else {
      return AWSUtil.get_asg(AS,asg_name);
    }
  })
  // add scheduled actions
  .then(function(asg){
    if(optional.scheduled_actions) {
      console.log(`${region}: adding scheduled actions`);
      var action_promises = optional.scheduled_actions.map(function(action){
        return AS.putScheduledUpdateGroupActionAsync({
          AutoScalingGroupName: asg_name,
          ScheduledActionName: action.name,
          DesiredCapacity: action.capacity,
          Recurrence: action.recurrence
        });
      });
      return BB.all(action_promises).then(function(){
        return AWSUtil.get_asg(AS, asg_name);
      });
    } else {
      return Promise.resolve(asg);
    }
  });
}

function create(regions, vpc_name, asg_name, lc_name, instance_tags, error_topic, optional){
  var region_promises = regions.map(function(region){
    return _do_create(region, vpc_name, asg_name, lc_name, instance_tags, error_topic, optional);
  });
  return BB.all(region_promises);
}

module.exports = create;
