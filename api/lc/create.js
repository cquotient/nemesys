'use strict';

var BB = require('bluebird');
var AWS = require('aws-sdk');

var AWSUtil = require('../aws_util');

function _do_create(region, lc_name, ami, i_type, key, sg, iam, ud, rud, disks, spot_price) {
  if(rud) {
    ud = [rud].concat(ud);
  }

  return BB.all([
    AWSUtil.get_ami_id(region, ami),
    AWSUtil.get_sg_ids(region, sg),
    AWSUtil.get_userdata_string(ud)
  ])
  .then(function(results){
    var bdms = AWSUtil.get_bdms(disks);
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
