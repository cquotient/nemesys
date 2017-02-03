'use strict';

const BB = require('bluebird');

const Logger      = require('../../logger');
const AWSUtil     = require('../aws_util');
const AWSProvider = require('../aws_provider');

function _create_elb (aws, lb_name, subnet_ids, opts, sg_id) {
	let cfg = {
		Name:           lb_name,
		Subnets:        subnet_ids,
		IpAddressType:  opts.ip_address_type,
		Scheme:         opts.scheme,
		SecurityGroups: [sg_id],
	};

	if (opts.tags && opts.tags.length) {
		cfg.Tags = opts.tags;
	}

	return aws.createLoadBalancerAsync(cfg);
}

function _get_targets_by_name (name, region) {
	const ec2 = AWSProvider.get_ec2(region),
		cfg = {
			Filters: [
				{
					Name: 'tag:Name',
					Values: [ name ]
				},
			]
		};

	return ec2.describeInstancesAsync(cfg);
}

function _register_indiv_targets (elb, tg, region) {
	let promise = Promise.resolve(),
		targets_cfg = [];

	if (tg.targets && tg.targets.length) {
		let promises = [];

		for (let target of tg.targets) {
			if (target.instance_id) {
				targets_cfg.push({
					Id:   target.instance_id,
					Port: target.port,
				});
				promises.push(Promise.resolve());
			}
			if (target.instance_name) {
				promises.push(_get_targets_by_name(target.instance_name, region)
					.then(data => {
						for (let r of data.Reservations) {
							for (let i of r.Instances) {
								targets_cfg.push({
									Id:   i.InstanceId,
									Port: target.port,
								});
							}
						}
					}));
			}
		}

		promise = BB.all(promises)
			.then(() => {
				return elb.registerTargetsAsync({
					TargetGroupArn: tg.arn,
					Targets:        targets_cfg
				});
			});
	}

	return promise;
}


function _create_targets (elb, target_groups, vpc_id, region) {
	let tg_promises = [];

	for (let target_group of target_groups) {
		let tg = Object.assign({}, target_group, {
			protocol:           'HTTP',
			health_path:        '/pulse',
			health_interval:    30,
			health_timeout:     5,
			health_threshold:   2,
			health_unthreshold: 2,
		});

		let p = elb.createTargetGroupAsync({
			Name:                       tg.name,
			Port:                       tg.port,
			Protocol:                   tg.protocol,
			VpcId:                      vpc_id,
			HealthCheckIntervalSeconds: tg.health_interval,
			HealthCheckPath:            tg.health_path,
			HealthCheckPort:            tg.port + '',
			HealthCheckProtocol:        tg.protocol,
			HealthCheckTimeoutSeconds:  tg.health_timeout,
			HealthyThresholdCount:      tg.health_threshold,
			UnhealthyThresholdCount:    tg.health_unthreshold,
		});

		p = p.then((result) => {
			tg.arn = result.TargetGroups[0].TargetGroupArn;

			return _register_indiv_targets(elb, tg, region).then(() => tg);
		});

		tg_promises.push(p);
	}

	return Promise.all(tg_promises);
}

function _create_listener (aws, tg, port, proto, lb, ssl_config) {
	let cfg = {
		DefaultActions:  [
			{
				TargetGroupArn: tg.arn,
				Type:           'forward'
			},
		],
		Port:            port,
		Protocol:        proto,
		LoadBalancerArn: lb.arn,
	};
	if (ssl_config) {
		cfg.SslPolicy = ssl_config.policy;
		cfg.Certificates = [{ CertificateArn: ssl_config.cert },];
	}
	return aws.createListenerAsync(cfg)
		.then((data) => data.Listeners[0].ListenerArn);
}

function _add_rule_to_listener (aws, lstn_arn, tg, priority) {
	let patterns = Array.isArray(tg.patterns) ? tg.patterns : [tg.patterns];
	let cfg = {
		Actions: [
			{
				TargetGroupArn: tg.arn,
				Type: 'forward'
			}
		],
		Conditions: [
			{
				Field: 'path-pattern',
				Values: patterns
			}
		],
		ListenerArn: lstn_arn,
		Priority:priority
	};

	return aws.createRuleAsync(cfg);
}

function _create_listeners (aws, lb, target_groups, ssl_config) {
	let promises = [];

	if (!target_groups || !target_groups.length) {
		return Promise.resolve();
	}

	// Create the default rule
	let tg = target_groups.shift();
	return BB.all([_create_listener(aws, tg, 80, 'HTTP', lb),
					_create_listener(aws, tg, 443, 'HTTPS', lb, ssl_config)])
		.spread((http_arn, https_arn) => {
			// The remaining should all be rules.
			let priority = 1;
			for (let tg of target_groups) {
				promises.push(_add_rule_to_listener(aws, http_arn, tg, priority++));
				promises.push(_add_rule_to_listener(aws, https_arn, tg, priority++));
				// TODO - the first TG should be the default one and all the others are optional rules added.
			}
		})
		.then(() => BB.all(promises));
}

function create (regions, vpc_name, sg_name, lb_name, target_groups, ssl_config, options) {
	let opts = {
		ip_address_type: 'ipv4', //'dualstack', // TODO - get an error about ip6 CIDR subnets
		scheme: options.internal ? 'internal' : 'internet-facing',
		tags: [], // TODO
	};
	let promises = [];

	for (let region of regions) {
		Logger.info(`Creating ALB ${lb_name} for ${region}`);
		const elb = AWSProvider.get_elbv2(region);
		let lb;

		let p = BB.all([
			AWSUtil.get_vpc_id(region, vpc_name),
			AWSUtil.get_sg_id(region, sg_name),
			AWSUtil.get_subnet_ids(region, vpc_name),
		]).spread((vpc_id, sg_id, subnet_ids) => _create_elb(elb, lb_name, subnet_ids, opts, sg_id)
			.then((data) => {
				lb = {
					arn: data.LoadBalancers[0].LoadBalancerArn,
				};
				return _create_targets(elb, target_groups, vpc_id, region);
			})
			.then((target_groups) => _create_listeners(elb, lb, target_groups, ssl_config)))
			.then(() => Logger.info(`Finished creating ALB ${lb_name} for ${region}`));

		// TODO - add alarms setup

		promises.push(p);
	}

	return BB.all(promises);
}

module.exports = create;
