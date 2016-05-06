'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');

function _get_subnet_id(ec2, region, vpc, az) {
  return AWSUtil.get_vpc_id(region, vpc)
  .then(function(vpc_id){
    return ec2.describeSubnetsAsync({
      Filters: [
        {
          Name: 'vpc-id',
          Values: [vpc_id]
        },
        {
          Name: 'availability-zone',
          Values: [region + az]
        }
      ]
    });
  }).then(function(data){
    return data.Subnets[0].SubnetId;
  });
}

function _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud, rud, disks, az, tags) {
  if(rud) {
    ud = [rud].concat(ud);
  }

  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));

  return BB.all([
    AWSUtil.get_ami_id(region, ami),
    AWSUtil.get_sg_ids(region, sg),
    AWSUtil.get_userdata_string(ud),
    _get_subnet_id(EC2, region, vpc, az)
  ])
  .then(function(results){
    var bdms = AWSUtil.get_bdms(disks);
    return {
      BlockDeviceMappings: bdms,
      IamInstanceProfile: {
        Name: iam
      },
      ImageId: results[0],
      InstanceType: i_type,
      KeyName: key_name,
      MaxCount: 1,
      MinCount: 1,
      Monitoring: {
        Enabled: true
      },
      NetworkInterfaces: [
        {
          AssociatePublicIpAddress: true,
          DeviceIndex: 0,
          Groups: results[1],
          SubnetId: results[3]
        }
      ],
      UserData: (new Buffer(results[2]).toString('base64'))
    };
  })
  .then(function(params){
    console.log(`${region}: launching instance`);
    return EC2.runInstancesAsync(params);
  })
  .then(function(data){
    console.log(`${region}: applying tags`);
    tags = tags.map(function(tag_str){
      var kv = tag_str.split('=');
      return {
        Key: kv[0],
        Value: kv[1]
      };
    });
    return EC2.createTagsAsync({
      Resources: [data.Instances[0].InstanceId],
      Tags: tags
    });
  });
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud, rud, disks, az, tags){
  var region_promises = regions.map(function(region, idx){
    return _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud, rud[idx], disks, az, tags);
  });
  return BB.all(region_promises);
}

module.exports = create;
