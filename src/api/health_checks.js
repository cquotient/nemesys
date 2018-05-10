'use strict';

const AWSProvider = require('./aws_provider');

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
			if (state == 'instanceRunning' && instance.State.Name !== 'running') {
				throw new Error(instance.StateReason.Message);
			}

			return instance.InstanceId;
		});
}

exports.wait_until_status = _wait_until_status;
