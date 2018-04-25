'use strict';

const BB = require('bluebird');

const AWSUtil = require('../aws_util');
const AWSProvider = require('../aws_provider');

function _do_create(region, lc_name, ami, i_type, key, sg, iam, ud, rud, disks, spot_price) {
	if(!ud) ud = [];
	if(rud) {
		ud = [rud].concat(ud);
	}

	return BB.all([
		AWSUtil.get_ami_id(region, ami),
		AWSUtil.get_sg_ids(region, sg),
		AWSUtil.get_userdata_string(ud),
		AWSUtil.get_bdms(region, disks)
	])
	.then(function(results){
		let params = {
			LaunchConfigurationName: lc_name,
			AssociatePublicIpAddress: true,
			BlockDeviceMappings: results[3],
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
		let lc_params = [params];
		if(spot_price) {
			let spot_clone = JSON.parse(JSON.stringify(params));
			spot_clone.LaunchConfigurationName = lc_name + '_spot';
			spot_clone.SpotPrice = spot_price + '';
			lc_params.push(spot_clone);
		}
		return lc_params;
	})
	.then(function(lc_params){
		let lc_proms = lc_params.map(function(param){
			return AWSProvider.get_as(region).createLaunchConfigurationAsync(param);
		});
		return BB.all(lc_proms);
	});
}

function create(regions, lc_name, ami, i_type, key, sg, iam, ud, rud, disks, spot_price){
	let region_promises = regions.map(function(region, idx){
		return _do_create(region, lc_name, ami, i_type, key, sg, iam, ud, rud[idx], disks, spot_price);
	});
	return BB.all(region_promises);
}

module.exports = create;
