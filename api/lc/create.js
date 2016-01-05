'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var fs = BB.promisifyAll(require('fs'));

var AWSUtil = require('../aws_util');

function _get_userdata_string(file_names) {
  var ud_files_proms = file_names.map(function(path){
    return fs.readFileAsync(path, 'utf-8');
  });
  return BB.all(ud_files_proms)
  .then(function(ud_files_content){
    // standard beginning of shell script user data, so we dont have to repeat it everywhere
  	var user_data_string = '#!/bin/bash\n\n';
  	user_data_string += 'set -o pipefail\n';
  	user_data_string += 'set -e -x\n';
  	user_data_string += 'exec >> /tmp/exec.log 2>&1\n\n';

    //concat with the rest of the user data
    return ud_files_content.reduce(function(prev, curr) {
      return prev + curr;
    }, user_data_string);
  });
}

function _get_sg_ids(region, sg) {
  var proms = sg.map(function(name){
    return AWSUtil.get_sg_id(region, name);
  });
  return BB.all(proms);
}

function _get_ami_id(region, ami_name) {
  var params = {
    Filters: [
      {
        Name: 'name',
        Values: [ami_name]
      }
    ]
  };
  var EC2 = BB.promisifyAll(new AWS.EC2({
    region: region,
    apiVersion: '2015-10-01'
  }));
  return EC2.describeImagesAsync(params)
  .then(function(data){
    return data.Images[0].ImageId;
  });
}

function _do_create(region, lc_name, ami, i_type, key, sg, iam, ud, rud, disks, spot_price) {
  if(rud) {
    ud = [rud].concat(ud);
  }

  return BB.all([
    _get_ami_id(region, ami),
    _get_sg_ids(region, sg),
    _get_userdata_string(ud)
  ])
  .then(function(results){
    var bdms = disks.map(function(d){
      var d_split = d.split(':');
      var bdm = {
        DeviceName: d_split[0]
      };
      if(d_split[1] === 'ebs') {
        bdm.Ebs = {
          VolumeSize: d_split[2],
          VolumeType: d_split[3],
          DeleteOnTermination: true
        };
      } else { //this means d_split[1] (which is the device type) is 'ephemeral'
        bdm.VirtualName = d_split[2];
      }
      return bdm;
    });
    var params = {
      LaunchConfigurationName: lc_name,
      AssociatePublicIpAddress: true,
      BlockDeviceMappings: bdms,
      IamInstanceProfile: iam,
      ImageId: results[0],
      InstanceMonitoring: {
        Enabled: true
      },
      InstanceType: i_type,
      KeyName: key,
      SecurityGroups: results[1],
      UserData: (new Buffer(results[2]).toString('base64'))
    };
    // we may need to create 2, so use an array for the lc param objects
    var lc_params = [params];
    if(spot_price) {
      var spot_clone = JSON.parse(JSON.stringify(params));
      spot_clone.LaunchConfigurationName = lc_name + '_spot';
      spot_clone.SpotPrice = spot_price + '';
      lc_params.push(spot_clone);
    }
    return lc_params;
  })
  .then(function(lc_params){
    var AS = BB.promisifyAll(new AWS.AutoScaling({
      region: region,
      apiVersion: '2011-01-01'
    }));
    var lc_proms = lc_params.map(function(param){
      return AS.createLaunchConfigurationAsync(param);
    });
    return BB.all(lc_proms);
  });
}

function create(regions, lc_name, ami, i_type, key, sg, iam, ud, rud, disks, spot_price){
  var region_promises = regions.map(function(region, idx){
    return _do_create(region, lc_name, ami, i_type, key, sg, iam, ud, rud[idx], disks, spot_price);
  });
  return BB.all(region_promises);
}

module.exports = create;
