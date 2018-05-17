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

function _do_create(create_region, instance_id, copy_regions, ami_name, disks, preserve_instance){
	return health_check.wait_for_spinup_complete(create_region, instance_id)
	.then(function(instance_id){
		Logger.info(`${create_region}: ${instance_id} ready, creating image ${ami_name}`);
		return AWSUtil.get_bdms(create_region, disks).then(function(bdms){
			return AWSProvider.get_ec2(create_region).createImageAsync({
				InstanceId: instance_id,
				Name: ami_name,
				BlockDeviceMappings: bdms
			}).then((result) => result.ImageId);
		});
	}).then(function(image_id){
		return _wait_for_image(create_region, image_id);
	}).then(function(image_id){
		if(copy_regions.length > 0) {
			Logger.info(`${create_region}: image is ready to copy, copying to: ${JSON.stringify(copy_regions)}`);
			let copy_image_promises = copy_regions.map(function(region){
				return AWSProvider.get_ec2(region).copyImageAsync({
					Name: ami_name,
					SourceImageId: image_id,
					SourceRegion: create_region
				}).then(function(result){
					return _wait_for_image(region, result.ImageId);
				});
			});
			return BB.all(copy_image_promises);
		} else {
			return Promise.resolve();
		}
	}).then(function(){
		if(preserve_instance) {
			Logger.info(`${create_region}: ${instance_id} will remain online`);
			return Promise.resolve();
		} else {
			Logger.info(`${create_region}: terminating instance ${instance_id}`);
			return AWSProvider.get_ec2(create_region).terminateInstancesAsync({
				InstanceIds: [instance_id]
			});
		}
	});
}

function create(regions, ami_name, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, disks, az, preserve_instance){
	let spinup_complete_ud = health_check.gen_spinup_complete_userdata(regions[0]);
	let tags = [`Name=nemesys-create-ami::${ami_name}`];
	// create in first region, then copy to others
	return create_instance([regions[0]], vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, spinup_complete_ud, disks, az, tags, null, null, false, [], false)
	.then(function(instance_ids){ //create_instance is for many regions, so result is an array of ids
		Logger.info(`${regions[0]}: instance (${instance_ids[0]}) created`);
		return _do_create(regions[0], instance_ids[0], regions.slice(1), ami_name, disks, preserve_instance);
	});
}

module.exports = create;
