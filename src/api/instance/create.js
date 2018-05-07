'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSUtil = require('../aws_util');
const AWSProvider = require('../aws_provider');

function _do_create(region, vpc, ami, i_type, key_name, sg, iam, ud_files, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt, elastic_ip) {
	let EC2 = AWSProvider.get_ec2(region);
	let new_instance_id;
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
		return AWSUtil.wait_until_status(region, data.Instances[0].InstanceId, 'instanceExists');
	})
	.then(function(instance_id){
		new_instance_id = instance_id;

		if (elastic_ip) {
			Logger.info(`${region}: getting info for EIP ${elastic_ip}`);
			return AWSUtil.get_eip_info(region, elastic_ip);
		}
	}).then(eip_hash => {
		if (elastic_ip) {
			if (eip_hash) {
				if (eip_hash.assoc_id) {
					Logger.info(`${region}: EIP is associated with assoc. ID: ${eip_hash.assoc_id}`);
					Logger.info(`${region}: Detaching EIP`);
					return AWSUtil.detach_elastic_ip(region, eip_hash.assoc_id)
						.then(() => {
							return eip_hash.alloc_id;
						});
				} else if (eip_hash.alloc_id) {
					Logger.info(`${region}: EIP not currenlt associated`);
					return eip_hash.alloc_id;
				}
			}
		}
	}).then((alloc_id) => {
		if (elastic_ip && alloc_id) {
			Logger.info(`${region}: Attach EIP to ${new_instance_id}`);
			return AWSUtil.attach_elastic_ip(region, new_instance_id, alloc_id);
		}
	}).then(() => {
		if (tags && tags.length > 0) {
			Logger.info(`${region}: instance ${new_instance_id} is ready, applying tags`);
			tags = tags.map(function(tag_str){
				let kv = tag_str.split('=');
				return {
					Key: kv[0],
					Value: kv[1]
				};
			});
			return EC2.createTagsAsync({
				Resources: [new_instance_id],
				Tags: tags
			}).then(() => new_instance_id);
		} else {
			return new_instance_id;
		}
	});
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, raw_ud_string, disks, az, tags, eni_name, env_vars, ebs_opt, elastic_ip){
	if( !(az.length === 1 || az.length === regions.length) ) {
		return Promise.reject(new Error(`Must pass either one AZ or one per region. Found ${az.length} for ${regions.length} region(s)`));
	}
	let region_promises = regions.map(function(region, idx){
		let zone = az.length == regions.length ? az[idx] : az[0];
		let userdata_files = AWSUtil.get_ud_files(ud_files, rud_files, idx);
		return _do_create(region, vpc, ami, i_type, key_name, sg, iam, userdata_files, raw_ud_string, disks, zone, tags, eni_name, env_vars, ebs_opt, elastic_ip);
	});
	return BB.all(region_promises);
}

module.exports = create;
