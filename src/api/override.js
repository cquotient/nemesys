'use strict';

const Promise = require('bluebird');
const AWSUtil = require('./aws_util');

function _build_override_params(region, oo) {
	// If these fail, we fall back to the default parameters
	return Promise.all([
			AWSUtil.get_ami_id(region, oo.ami).catch(() => null),
			AWSUtil.get_userdata_string(oo.ud_files, oo.env_vars, oo.raw_ud_string).catch(() => null),
			AWSUtil.get_network_interface(region, oo.vpc, oo.az, oo.eni_name, oo.sg).catch(() => null),
			AWSUtil.get_bdms(oo.disks) // Not a promise
		])
		.spread(function(ami_id, userdata_string, network_interface, bdms){
			let config = {
				BlockDeviceMappings: bdms,
				ImageId: ami_id,
				InstanceType: oo.i_type,
				KeyName: oo.key_name,
				NetworkInterfaces: network_interface,
			};
			if (typeof(oo.ebs_opt) === 'boolean') {
				config.EbsOptimized = !!oo.ebs_opt;
			}
			if (oo.iam) {
				config.IamInstanceProfile = {
					Name: oo.iam
				};
			}
			if ((oo.ud_files && oo.ud_files.length) || oo.raw_ud_string) {
				config.UserData = new Buffer(userdata_string).toString('base64');
			}
			return config;
		});
}

function merge_config(region, orig_config, override_opts) {
	return _build_override_params(region, override_opts).then(function(override_config) {
		for (let key of Object.keys(override_config)) {
			let val = override_config[key];
			// Don't assign null, empty or undefined configurations
			if (val == null || (Array.isArray(val) && !val.length)) {
				delete override_config[key];
			}
		}
		let new_config = Object.assign(orig_config, override_config);
		return new_config;
	});
}

module.exports = {
	merge_config
};
