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

function _get_eni_id(ec2, region, vpc, az, eni_name) {
  return AWSUtil.get_vpc_id(region, vpc)
  .then(function(vpc_id){
    return ec2.describeNetworkInterfacesAsync({
      Filters: [
        {
          Name: 'vpc-id',
          Values: [vpc_id]
        },
        {
          Name: 'availability-zone',
          Values: [region + az]
        },
        {
          Name: 'tag:Name',
          Values: [eni_name]
        }
      ]
    });
  }).then(function(data){
    return data.NetworkInterfaces[0].NetworkInterfaceId;
  });
}

function _get_network_interface(ec2, region, vpc, az, eni_name, sg_ids_promise, subnet_id_promise) {
  return BB.all([
    sg_ids_promise,
    subnet_id_promise
  ])
  .then(function(results){
    if(eni_name) {
      return _get_eni_id(ec2, region, vpc, az, eni_name)
      .then(function(eni_id){
        return {
          DeviceIndex: 0,
          NetworkInterfaceId: eni_id
        };
      });
    } else {
      return Promise.resolve({
        AssociatePublicIpAddress: true,
        DeviceIndex: 0,
        Groups: results[0],
        SubnetId: results[1]
      });
    }
  });
}

function _resolve_instance(ec2, region, instance_id) {
  return new Promise(function(resolve, reject){
    function _check(){
      ec2.describeInstancesAsync({InstanceIds: [instance_id]}).then(function(result){
        if(result.Reservations.length === 1
        && result.Reservations[0].Instances.length === 1) {
          resolve(instance_id);
        } else {
          console.log(`${region}: waiting for instance ${instance_id} to be ready`);
          setTimeout(_check, 5000);
        }
      }).catch(reject);
    }
    _check();
  });
}

function _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud, rud, disks, az, tags, eni_name) {
  if(rud) {
    ud = [rud].concat(ud);
  }

  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));

  var sg_ids_promise = AWSUtil.get_sg_ids(region, sg);
  var subnet_id_promise = _get_subnet_id(EC2, region, vpc, az);

  return BB.all([
    AWSUtil.get_ami_id(region, ami),
    AWSUtil.get_userdata_string(ud),
    _get_network_interface(EC2, region, vpc, az, eni_name, sg_ids_promise, subnet_id_promise)
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
      NetworkInterfaces: [results[2]],
      UserData: (new Buffer(results[1]).toString('base64'))
    };
  })
  .then(function(params){
    console.log(`${region}: launching instance`);
    return EC2.runInstancesAsync(params);
  })
  .then(function(data){
    return _resolve_instance(EC2, region, data.Instances[0].InstanceId);
  })
  .then(function(instance_id){
    console.log(`${region}: instance ${instance_id} is ready, applying tags`);
    tags = tags.map(function(tag_str){
      var kv = tag_str.split('=');
      return {
        Key: kv[0],
        Value: kv[1]
      };
    });
    return EC2.createTagsAsync({
      Resources: [instance_id],
      Tags: tags
    });
  });
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud, rud, disks, az, tags, eni_name){
  var region_promises = regions.map(function(region, idx){
    return _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud, rud[idx], disks, az, tags, eni_name);
  });
  return BB.all(region_promises);
}

module.exports = create;
