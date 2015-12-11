'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');
var validator = require('validator');

function _get_sg_id(EC2, group_name) {
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

function _get_ip_permissions(EC2, ingress) {
  var perms = [],
      groups_to_lookup = [];
  ingress.forEach(function(obj){
    var parts = obj.split(':');
    if(validator.isIP(parts[0]) || parts[0] === '0.0.0.0/0') {
      perms.push({
        FromPort: parts[1],
        ToPort: parts[1],
        IpProtocol: 'tcp',
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
      return _get_sg_id(EC2, parts[0])
      .then(function(group_id) {
        perms.push({
          FromPort: parts[1],
          ToPort: parts[1],
          IpProtocol: 'tcp',
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

function _do_create(region_config, region, sg_name, desc, ingress) {
  if(!desc) desc = sg_name;
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  return EC2.createSecurityGroupAsync({
    Description: desc,
    GroupName: sg_name,
    DryRun: false,
    VpcId: region_config.vpc
  })
  .then(function(result){
    console.log(`${region}: created security group ${sg_name} (${result.GroupId})`);
    if(ingress && ingress.length > 0) {
      return _get_ip_permissions(EC2, ingress)
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

function _create(regions_config, regions, sg_name, desc, ingress) {
  var region_promises = regions.map(function(region){
    return _do_create(regions_config[region], region, sg_name, desc, ingress);
  });
  return BB.all(region_promises);
}

module.exports = _create;
