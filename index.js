'use strict';

var util = require('util');

var AWS = require('aws-sdk');
var BB = require('bluebird');

function balance(region, nonspot, spot) {
  var asgs = [nonspot, spot];
  var AS = new AWS.AutoScaling({region: region});
  AS.describeAutoScalingGroups({
    AutoScalingGroupNames: asgs
  },
  function(err, data){
    if(err) console.log(err, err.stack);
    else console.log(data);
    if(data.AutoScalingGroups.length < asgs.length) {
      asgs.forEach(function(expected){
        var found = data.AutoScalingGroups.some(function(obj){return obj.AutoScalingGroupName === expected;});
        if(!found) {
          console.log('No ASG found for name: %s', expected);
        }
      });
    }
  });
}

exports.replace = require('./commands/replace');
