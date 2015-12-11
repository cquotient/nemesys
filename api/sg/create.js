'use strict';

var AWS = require('aws-sdk');
var BB = require('bluebird');

function _get_ip_permissions(ingress) {
  return ingress.map(function(obj){
    var parts = obj.split(':');
    return {
      FromPort: parts[1],
      ToPort: parts[1],
      IpProtocol: 'tcp',
      IpRanges: [
        {
          CidrIp: parts[0] + '/32'
        }
      ]
    };
  });
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
    console.log(`${region}: created security group ${sg_name} (${result.GroupId})`)
    if(ingress && ingress.length > 0) {
      return EC2.authorizeSecurityGroupIngressAsync({
        DryRun: false,
        GroupId: result.GroupId,
        IpPermissions: _get_ip_permissions(ingress)
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
