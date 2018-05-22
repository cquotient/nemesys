'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');
const AWSProvider = require('../aws_provider');
const health_check = require('../health_checks');

function _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud_files, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt, elastic_ip, reassociate_eip) {
	let EC2 = AWSProvider.get_ec2(region);
	return BB.all([
		AWSUtil.get_ami_id(region, ami),
		AWSUtil.get_userdata_string(ud_files, env_vars, raw_ud_string),
		AWSUtil.get_network_interface(region, vpc, az, eni_name, sg),
		AWSUtil.get_bdms(region, disks)
	])
	.spread(function(ami_id, userdata_string, network_interface, bdms){
		return {
			BlockDeviceMappings: bdms,
			EbsOptimized: !!ebs_opt,
			IamInstanceProfile: {
				Name: iam
			},
			ImageId: ami_id,
			InstanceType: i_type,
			KeyName: key_name,
			MaxCount: 1,
			MinCount: 1,
			Monitoring: {
				Enabled: true
			},
			NetworkInterfaces: [network_interface],
			UserData: (new Buffer(userdata_string).toString('base64'))
		};
	})
	.then(function(params){
		Logger.info(`${region}: launching instance`);
		return EC2.runInstancesAsync(params);
	})
	.then(function(data){
		return health_check.wait_until_status(region, data.Instances[0].InstanceId, 'instanceExists');
	}).then(instance_id => {
		if (tags && tags.length > 0) {
			Logger.info(`${region}: instance ${instance_id} is ready, applying tags`);
			tags = tags.map(function(tag_str){
				let kv = tag_str.split('=');
				return {
					Key: kv[0],
					Value: kv[1]
				};
			});
			return EC2.createTagsAsync({
				Resources: [instance_id],
				Tags: tags
			}).then(() => instance_id);
		} else {
			return instance_id;
		}
	}).then(instance_id => {
		// Only after tags are finished should we reassociate the elastic IP to the new instance
		if (elastic_ip) {
			Logger.info(`${region}: getting info for EIP ${elastic_ip}`);
			return AWSUtil.get_eip_info(region, elastic_ip).then(eip_hash => {
					if (elastic_ip && eip_hash) {
						if (eip_hash.assoc_id) {
							Logger.info(`${region}: EIP is associated with assoc. ID: ${eip_hash.assoc_id}`);
							if (reassociate_eip) {
								// Before we detach the existing EIP we should be sure that the new instance is good to go
								return health_check.wait_for_spinup_complete(region, instance_id)
									.then(() => {
										Logger.info(`${region}: Detaching EIP`);
										return AWSUtil.detach_elastic_ip(region, eip_hash.assoc_id)
											.then(() => {
												return eip_hash.alloc_id;
											});
									});
							} else {
								// Will return nothing, skipping the next step
								Logger.info(`${region}: EIP is associated already but reassociate-eip is false, skipping`);
							}
						} else if (eip_hash.alloc_id) {
							Logger.info(`${region}: EIP not currently associated`);
							return eip_hash.alloc_id;
						}
					}
				})
				.then(alloc_id => {
					if (elastic_ip && alloc_id) {
						Logger.info(`${region}: Attach EIP to ${instance_id}`);
						return AWSUtil.attach_elastic_ip(region, instance_id, alloc_id)
							.then(() => {
								return instance_id;
							});
					} else {
						return instance_id;
					}
				});
		} else {
			return instance_id;
		}
	});
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt, elastic_ips, reassociate_eip){
	if( !(az.length === 1 || az.length === regions.length) ) {
		return Promise.reject(new Error(`Must pass either one AZ or one per region. Found ${az.length} for ${regions.length} region(s)`));
	}
	let region_promises = regions.map(function(region, idx){
		let eip;
		if(elastic_ips && elastic_ips.length) {
			eip = elastic_ips[idx];
			if (reassociate_eip) {
				let spinup_complete_ud = health_check.gen_spinup_complete_userdata(region);
				if (raw_ud_string) {
					raw_ud_string += spinup_complete_ud;
				} else {
					raw_ud_string = spinup_complete_ud;
				}
			}
		}
		let zone = az.length == regions.length ? az[idx] : az[0];
		let userdata_files = AWSUtil.get_ud_files(ud_files, rud_files, idx);
		return _do_create(region, vpc, ami, i_type, key_name, sg, iam, userdata_files, raw_ud_string, disks, zone, tags, eni_name, env_vars, ebs_opt, eip, reassociate_eip);
	});
	return BB.all(region_promises);
}

module.exports = create;
