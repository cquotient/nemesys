'use strict';

const BB = require('bluebird');

const AWSProvider = require('../aws_provider');
const create_instance = require('../instance/create');

function _is_tag_present(tags, key, value) {
	if(tags && tags.length > 0) {
		for(let i=0 ; i<tags.length ; i++) {
			if(tags[i].Key == key && tags[i].Value == value) return true;
		}
	}
	return false;
}

function _wait_for_spinup_complete(region, instance_id) {
	return new Promise(function(resolve, reject){
		function _check(){
			AWSProvider.get_ec2(region).describeInstancesAsync({InstanceIds: [instance_id]}).then(function(result){
				if(result.Reservations.length === 1
				&& result.Reservations[0].Instances.length === 1
				&& _is_tag_present(result.Reservations[0].Instances[0].Tags, 'Spinup', 'complete')) {
					resolve(instance_id);
				} else {
					console.log(`${region}: waiting for instance ${instance_id} spinup to complete with tag Spinup=complete`);
					setTimeout(_check, 5000);
				}
			}).catch(reject);
		}
		_check();
	});
}

function _do_create(create_region, instance_id, copy_regions){
	return _wait_for_spinup_complete(create_region, instance_id)
	.then(function(instance_id){
		
	});
}

function _gen_spinup_complete_ud(region) {
	return `aws ec2 create-tags --region ${region} --resources \`ec2metadata --instance-id\` --tags Key=Spinup,Value=complete\n`;
}

function create(regions, vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, disks, az){
	let spinup_complete_ud = _gen_spinup_complete_ud(regions[0]);
	// create in first region, then copy to others
	return create_instance([regions[0]], vpc, ami, i_type, key_name, sg, iam, ud_files, rud_files, spinup_complete_ud, disks, az)
	.then(function(instance_id){
		return _do_create(regions[0], instance_id, regions.slice(1));
	});
}

module.exports = create;
