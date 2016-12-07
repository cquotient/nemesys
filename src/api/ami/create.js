'use strict';

const BB = require('bluebird');

const create_instance = require('../instance/create');

function _do_create(create_region, instance_id, copy_regions){

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
