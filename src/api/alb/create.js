'use strict';

const BB = require('bluebird');

const Logger = require('../../logger');
const AWSProvider = require('../aws_provider');
const AWSUtil = require('../aws_util');

function _create_elb (aws, lb_name, subnet_ids, opts, sg_id) {
	let cfg = {
		Name:           lb_name,
		Subnets:        subnet_ids,
		IpAddressType:  opts.ip_address_type,
		Scheme:         opts.scheme,
		SecurityGroups: [sg_id],
	};

	if (opts.tags && opt.tags.length) {
		cfg.Tags = opts.tags
	}

	return aws.createLoadBalancerAsync();
}

function _register_indiv_targets (tg, aws) {
	let promise = Promise.resolve();

	if (tg.targets && tg.targets.length) {
		let promises = [];

		for (let target of tg.targets) {
			if (target.instance_id) {
				promises.push(Promise.resolve({
					Id:   target.instance_id,
					Port: target.port,
				}));
			}
			if (target.instance_name) {
				// TODO - look up all instances with name
			}
		}

		promise = BB.all(promises)
			.then((targets_cfg) => {
				return aws.registerTargetsAsync({
					TargetGroupArn: tg.arn,
					Targets:        targets_cfg
				});
			});
	}

	return promise;
}


function _create_targets (aws, target_groups, vpc_id) {
	let tg_promises = [];

	for (let target_group of target_groups) {
		let tg = Object.assign({}, target_group, {
			protocol:           'HTTP',
			health_interval:    30,
			health_timeout:     5,
			health_threshold:   2,
			health_unthreshold: 2,
			health_path:        '/pulse',
		});

		let p = aws.createTargetGroupAsync({
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

			return _register_indiv_targets(tg, aws).then(() => tg);
		});

		tg_promises.push(p);
	}

	return Promise.all(tg_promises);
}

function _todo_make_name (aws, tg, port, proto, lb) {
	let cfg = {
		DefaultActions:  [
			{
				TargetGroupArn: tg.arn,
				Type:           'forward'
			},
		],
		Port:            port,
		Protocol:        proto,
		LoadBalancerArn: lb.LoadBalancerArn,
	};
	if (tg.protocol === 'HTTPS') {
		cfg.SslPolicy = 'STRING_VALUE';
		cfg.Certificates = [{CertificateArn: 'STRING_VALUE'},];
	}
	return aws.createListenerAsync(cfg);
	//.then((lsnr) => {
	// return aws.createRuleAsync({
	// 	Actions:     [
	// 		{
	// 			TargetGroupArn: tg.arn,
	// 			Type:           'forward',
	// 		},
	// 	],
	// 	Conditions:  [
	// 		{
	// 			Field:  'path-pattern',
	// 			Values: [
	// 				'STRING_VALUE', // eg. '/img/*'
	// 			]
	// 		},
	// 	],
	// 	ListenerArn: lsnr.Listeners[0].ListenerArn,
	// 	Priority:    priority++
	// });
	//});
}

function _create_listener (aws, lb, target_groups) {
	let promises = [];

	for (let tg of target_groups) {
		promises.push(_todo_make_name(aws, tg, 80, 'HTTP', lb));
		// promises.push(_todo_make_name(aws, tg, 443, 'HTTPS', lb));

		// TODO - the first TG should be the default one and all the others are optional rules added.
	}

	return BB.all(promises);
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
		const aws = AWSProvider.get_elb(region);
		let lb;

		let p = BB.all([
			AWSUtil.get_vpc_id(region, vpc_name),
			AWSUtil.get_sg_id(region, sg_name),
			AWSUtil.get_subnet_ids(region, vpc_name),
		]).spread((vpc_id, sg_id, subnet_ids) => _create_elb(aws, lb_name, subnet_ids, opts, sg_id)
			.then((data) => {
				lb = data.LoadBalancers[0];
				return _create_targets(aws, target_groups, vpc_id);
			})
			.then((target_groups) => _create_listener(aws, lb, target_groups)))
			.then(() => Logger.info(`Finished creating ALB ${lb_name} for ${region}`));

		// TODO - add alarms

		promises.push(p);
	}

	return BB.all(promises);
}

module.exports = create;
