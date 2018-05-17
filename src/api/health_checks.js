'use strict';

const AWSProvider = require('./aws_provider');
const Logger = require('../logger');

// uses waitFor to poll an instance for a specific state
// state can be any state accepted by waitForAsync
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/EC2.html#waitFor-property
function _wait_until_status(region, instanceId, state) {
	return AWSProvider
		.get_ec2(region)
		.waitForAsync(state, {
			InstanceIds: [instanceId]
		})
		.then(function (data) {
			const instance = data.Reservations[0].Instances[0];

			// original function only checked for 'instanceRunning', and
			// explicitly checked for 'running' State.Name.  Leave if for
			// expected behavior.
			if (state === 'instanceRunning' && instance.State.Name !== 'running') {
				throw new Error(instance.StateReason.Message);
			}

			return instance.InstanceId;
		});
}

function _wait_until_healthy(region, lbName, instanceId) {
	return AWSProvider
		.get_elb(region)
		.waitForAsync('instanceInService', {
			LoadBalancerName: lbName,
			Instances: [
				{
					InstanceId: instanceId
				}
			]
		})
		.then(function (data) {
			const state = data.InstanceStates[0];

			if (state.State != 'InService') {
				throw new Error(state.Description);
			}
		});
}

function _gen_spinup_complete_userdata(region) {
	return `\naws ec2 create-tags --region ${region} --resources \`curl http:\/\/169.254.169.254\/latest\/meta-data\/instance-id\` --tags Key=Spinup,Value=complete\n`;
}

function _is_tag_present(tags, key, value) {
	if(tags && tags.length > 0) {
		for(let i=0; i<tags.length; i++) {
			if(tags[i].Key == key && tags[i].Value == value) return true;
		}
	}
	return false;
}

function _wait_for_spinup_complete(region, instance_id) {
	return new Promise(function(resolve, reject) {
		function _check() {
			AWSProvider.get_ec2(region).describeInstancesAsync({InstanceIds: [instance_id]})
			.then(function(result) {
				if (result.Reservations.length === 1
					&& result.Reservations[0].Instances.length === 1
					&& _is_tag_present(result.Reservations[0].Instances[0].Tags, 'Spinup', 'complete')) {
						resolve(instance_id);
				} else {
					Logger.info(`${region}: waiting for instance ${instance_id} spinup to complete with tag Spinup=complete`);
					setTimeout(_check, 30000);
				}
			}).catch(reject);
		}
		_check();
	});
}

exports.wait_until_status = _wait_until_status;
exports.wait_until_healthy = _wait_until_healthy;
exports.gen_spinup_complete_userdata = _gen_spinup_complete_userdata;
exports.wait_for_spinup_complete = _wait_for_spinup_complete;
