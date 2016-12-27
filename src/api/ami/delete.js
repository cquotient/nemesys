'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSProvider = require('../aws_provider');

function _do_delete(region, ami_name) {
	return AWSProvider.get_ec2(region).describeImagesAsync({
		Filters: [
			{
				Name: 'name',
				Values: [ami_name]
			}
		]
	}).then(function(result){
		Logger.info(`${region}: deleting image ${ami_name}(${result.Images[0].ImageId})`);
		return AWSProvider.get_ec2(region).deregisterImageAsync({
			ImageId: result.Images[0].ImageId
		}).then(() => result.Images[0]);
	}).then(function(image){
		let snapshot_ids = [];
		image.BlockDeviceMappings.forEach(function(bdm){
			if(bdm.Ebs && bdm.Ebs.SnapshotId) {
				snapshot_ids.push(bdm.Ebs.SnapshotId);
			}
		});
		if(snapshot_ids.length > 0) {
			Logger.info(`${region}: deleting ${snapshot_ids.length} ebs snapshots for ${ami_name}`);
			let snap_del_promises = snapshot_ids.map(function(snap_id){
				return AWSProvider.get_ec2(region).deleteSnapshotAsync({
					SnapshotId: snap_id
				});
			});
			return BB.all(snap_del_promises).then(() => Promise.resolve());
		} else {
			return Promise.resolve();
		}
	});
}

function _delete(regions, ami_name) {
	let region_promises = regions.map((r) => _do_delete(r, ami_name));
	return BB.all(region_promises);
}

module.exports = _delete;
