'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');
var validator = require('validator');

var AWSUtil = require('../aws_util');

function _get_ip_permissions(region, ingress) {
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  var perms = [],
      groups_to_lookup = [];
  ingress.forEach(function(obj){
    var parts = obj.split(':');
    if(validator.isIP(parts[0].split('/')[0]) || parts[0] === '0.0.0.0/0') {
      var protocol = parts[2] ? parts[2] : 'tcp';
      perms.push({
        FromPort: parts[1],
        ToPort: parts[1],
        IpProtocol: protocol,
        IpRanges: [
          {
            CidrIp: parts[0]
          }
        ]
      });
    } else {
      groups_to_lookup.push(obj);
    }
  });

  if(groups_to_lookup.length > 0) {
    var group_id_proms = groups_to_lookup.map(function(obj){
      var parts = obj.split(':');
      return AWSUtil.get_sg_id(region, parts[0])
      .then(function(group_id) {
        var protocol = parts[2] ? parts[2] : 'tcp';
        perms.push({
          FromPort: parts[1],
          ToPort: parts[1],
          IpProtocol: protocol,
          UserIdGroupPairs: [
            {
              GroupId: group_id
            }
          ]
        });
      });
    });
    return BB.all(group_id_proms)
    .then(function(){
      return perms;
    });
  } else {
    return Promise.resolve(perms);
  }
}

function _do_create(region, vpc_name, sg_name, desc, ingress) {
  if(!desc) desc = sg_name;
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  return AWSUtil.get_vpc_id(region, vpc_name)
  .then(function(vpc_id){
    return EC2.createSecurityGroupAsync({
      Description: desc,
      GroupName: sg_name,
      DryRun: false,
      VpcId: vpc_id
    });
  })
  .then(function(result){
    console.log(`${region}: created security group ${sg_name} (${result.GroupId})`);
    if(ingress && ingress.length > 0) {
      return _get_ip_permissions(region, ingress)
      .then(function(ip_perms){
        return EC2.authorizeSecurityGroupIngressAsync({
          DryRun: false,
          GroupId: result.GroupId,
          IpPermissions: ip_perms
        });
      })
      .then(function(result){
        console.log(`${region}: successfully applied ${ingress.length} sg ingress rules to ${sg_name}`);
      });
    }
  });
}

function _create(regions, vpc_name, sg_name, desc, ingress) {
  var region_promises = regions.map(function(region){
    return _do_create(region, vpc_name, sg_name, desc, ingress);
  });
  return BB.all(region_promises);
}

module.exports = _create;
