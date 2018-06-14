'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');
const create_instance = require('../instance/create');
const health_check = require('../health_checks');

function _wait_for_image(region, image_id) {
	Logger.info(`${region}: waiting for image ${image_id} to be available`);
	return AWSProvider.get_ec2(region).waitForAsync('imageAvailable', {
		ImageIds: [image_id]
	}).then(function(){
		Logger.info(`${region}: image ${image_id} is available`);
	}).then(() => image_id);
}

function _do_create(region, instance_id, ami_name, disks){
	return health_check.wait_for_spinup_complete(region, instance_id)
		.then(function(instance_id){
			Logger.info(`${region}: ${instance_id} ready, creating image ${ami_name}`);
			return AWSUtil.get_bdms(region, disks).then(function(bdms){
				return AWSProvider.get_ec2(region).createImageAsync({
					InstanceId: instance_id,
					Name: ami_name,
					BlockDeviceMappings: bdms
				}).then((result) => result.ImageId);
			});
		}).then(function(image_id){
			return _wait_for_image(region, image_id);
		});
}

function _do_copy(source_region, target_regions, ami_name, image_id) {
	Logger.info(`${source_region}: image is ready to copy, copying to: ${JSON.stringify(target_regions)}`);
	let copy_image_promises = target_regions.map(function(dst_region){
		return AWSProvider.get_ec2(dst_region).copyImageAsync({
			Name: ami_name,
			SourceImageId: image_id,
			SourceRegion: source_region
		}).then(function(result){
			return _wait_for_image(dst_region, result.ImageId);
		});
	});
	return BB.all(copy_image_promises);
}

function _terminate_instance(region, instance_id) {
	Logger.info(`${region}: terminating instance ${instance_id}`);
	return AWSProvider.get_ec2(region).terminateInstancesAsync({
		InstanceIds: [instance_id]
	});
}

function create(regions, ami_name, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, disks, az, preserve_instance, create_in_all_regions) {

	// set use_copy_strategy to false if create_in_all_regions is true. We are creating regional AMIs
	let use_copy_strategy = !create_in_all_regions;
	// set use_copy_strategy false if regional userdata files are given
	if (use_copy_strategy) {
		use_copy_strategy = rud_files && rud_files.length > 1 ? false : true;
	}
	const tags = [`Name=nemesys-create-ami::${ami_name}`];

	if (use_copy_strategy) {
		const spinup_complete_ud = health_check.gen_spinup_complete_userdata(regions[0]);

		// create in first region, then copy to others
		return create_instance([regions[0]], vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, spinup_complete_ud, disks, az, tags, null, null, false, [], false)
			.then(function(instance_ids){ //create_instance is for many regions, so result is an array of ids
				const instance_created = instance_ids[0];
				Logger.info(`${regions[0]}: instance (${instance_created}) created`);
				return _do_create(regions[0], instance_created, ami_name, disks)
					.then(function(image_id) {
						if (regions.slice(1).length > 0) {
							return _do_copy(regions[0], regions.slice(1), ami_name, image_id);
						} else {
							return Promise.resolve();
						}
					}).then(() => instance_created);
			}).then(function(instance_id) {
				if (preserve_instance) {
					Logger.info(`${regions[0]}: ${instance_id} will remain online`);
					return Promise.resolve();
				}

				return _terminate_instance(regions[0], instance_id);
			});
	} else {
		if ( !(az.length > 1 && az.length === regions.length) ) {
			return Promise.reject(new Error(`Number of AZ and regions must match.  Found ${az.length} for ${regions.length} region(s)`));
		}

		let region_promises = regions.map(function(region, idx){
			const spinup_complete_ud = health_check.gen_spinup_complete_userdata(region);

			// we concat ud_files and rud_files here because we only pass a
			// single region to create_instance(); therefore the region index
			// won't be correct in that function
			const userdata_files = AWSUtil.get_ud_files(ud_files, rud_files, idx);
			return create_instance([region], vpc, ami, i_type, key_name, sg, iam, userdata_files, null, spinup_complete_ud, disks, [az[idx]], tags, null, null, false, [], false)
				.then(function(instance_ids){
					const instance_id = instance_ids[0];
					Logger.info(`${region}: instance (${instance_id}) created`);
					return _do_create(region, instance_id, ami_name, disks)
						.then(function() {
							if (preserve_instance) {
								Logger.info(`${region}: ${instance_id} will remain online`);
								return Promise.resolve();
							}

							return _terminate_instance(region, instance_id);
						});
				});
		});
		return BB.all(region_promises);
	}
}

module.exports = create;
