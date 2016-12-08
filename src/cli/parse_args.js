#!/usr/bin/env node
'use strict';
//TODO use yargs auto completion feature!

let group_opt = {
	alias: 'group',
	describe: 'Name of the Autoscaling Group to create or update'
};

let lc_opt = {
	alias: 'launch-config',
	describe: 'Name of the Launch Configuration'
};

let tags_opt = {
	alias: 'instance-tags',
	describe: 'Tags to apply to instances launched from this ASG',
	array: true
};

let vpc_opt = {
	alias: 'vpc',
	describe: 'Value of the VPC "Name" tag'
};

let ingress_rules_opt = {
	alias: 'ingress-rules',
	describe: 'Security Group ingress rules, in the format of {ip/group name}:{port}[:{protocol}]. Default protocol is tcp',
	array: true
};

function _common_args(yargs) {
	return yargs
		.option('r', {
			alias: 'regions',
			describe: 'EC2 regions to operate in',
			array: true,
			choices: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
		})
		// .config('json-config', {
		// 	describe: 'List of JSON files with parameters',
		// 	array: true
		// })
		//TODO is there a way to use coerce, instead of having to do path normalization in
		// arg_handler.js?
		// .coerce('user-data-files', function(arg){
		// 	console.log('coercing user-data');
		// })
		.demand(['regions']);
}

function parse_args (args) {
	let argv = require('yargs')(args || process.argv)
		.usage('nemesys {command}')
		// commands

		.command('update', 'Update an EC2 resource', function (yargs, argv) {
			yargs

				.command('asg', 'Update an Autoscaling Group with a new Launch Configuration', function (yargs, argv) {
					yargs
						.option('g', group_opt)
						.option('l', lc_opt)
						.demand(['group', 'launch-config'])
						.example('nemesys update asg -g tracking_asg -l tracking_lc_2015_12_03 -r us-east-1 us-west-2',
							'Updates the launch config for an ASG called tracking_asg to be tracking_lc_2015_12_03 in us-east-1, us-west-2, and eu-west-1')
						.help('h')
						.alias('h', 'help');
				})

				.command('sg', 'Update a Security Group', function (yargs, argv) {
					_common_args(yargs)
						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group'
						})
						.option('i', {
							alias:    'ingress-rules',
							describe: 'Security Group ingress rules, in the format of {ip/group name}:{port}[:{protocol}]. Default protocol is tcp',
							type:     'array'
						})
						.option('remove', {
							describe: 'Use this flag to remove, instead of add, the specified rules',
							type:     'boolean'
						})
						.demand(['security-group'])
				})

				.demand(2)

				.help('h')
				.alias('h', 'help');
		})

		.command('create', 'Create an EC2 resource', function (yargs, argv) {
			yargs

				.command('asg', 'Create an Autoscaling Group', function (yargs, argv) {
					_common_args(yargs)

						.option('v', vpc_opt)
						.option('g', group_opt)
						.option('l', lc_opt)
						.option('t', tags_opt)
						.option('e', {
							alias:    'error-topic',
							describe: 'SNS topic to notify of ASG errors'
						})
						.option('z', {
							alias:    'availability-zones',
							array:    true,
							describe: 'Availability zones to launch instances in for this ASG'
						})
						.option('min-instance-count', {
							describe: 'Minimum number of instances in ASG'
						})
						.option('max-instance-count', {
							describe: 'Maximum number of instances in ASG'
						})
						.option('desired-instance-count', {
							describe: 'Desired number of instances in ASG'
						})
						.demand(['vpc', 'group', 'launch-config'])
						.example('nemesys create asg -v my_vpc -g tracking_asg -l tracking_lc -t Client=all -t Name=tracking-asg -t Task=tracking -e cq-pixel-error -r us-west-2',
							'Creates a new ASG in us-west-2 called tracking_asg with launch config tracking_lc, error topic "cq-pixel-error", and some tags')
						.help('h')
						.alias('h', 'help');
				})

				.command('sg', 'Create a Security Group', function (yargs, argv) {
					_common_args(yargs)
						.option('v', vpc_opt)
						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group'
						})
						.option('d', {
							alias:    'description',
							describe: 'Description of the Security Group'
						})
						.option('i', ingress_rules_opt)

						.demand(['vpc', 'security-group'])
						.example('nemesys create sg -s ssh-access -c ~/x6/Automation/nemesys/regions.json -r ap-southeast-1',
							'Creates a security group in ap-southeast-1 called "ssh-access", using regions.json to discover the vpc to use');
				})

				.command('lc', 'Create a Launch Configuration', function (yargs, argv) {
					_common_args(yargs)

						.option('l', lc_opt)
						.option('a', {
							alias:       'ami',
							description: 'AMI name'
						})
						.option('i', {
							alias:    'instance-type',
							describe: 'EC2 API name of the instance type to use (ie, m3.large)'
						})
						.option('k', {
							alias:    'ssh-key-pair',
							describe: 'Name of the ssh key pair to use for instances using this Launch Configuration'
						})
						.option('I', {
							alias:    'iam-role',
							describe: 'IAM role for launched instances'
						})
						.option('s', {
							alias:    'security-groups',
							describe: 'Name of the Security Group(s) to apply to instances using this Launch Configuration',
							array:    true
						})
						.option('u', {
							alias:    'user-data-files',
							describe: 'Shell script files to combine to form the user data',
							array:    true
						})
						.option('region-user-data', {
							describe: 'Region-specific user data files, which will appear BEFORE all other user data in the resulting script. This must be in the same order as the regions passed in via --regions',
							array:    true,
							default:  []
						})
						.option('d', {
							alias:    'disks',
							describe: 'Disks to attach to instances using this Launch Configuration',
							array:    true
						})
						.option('S', {
							alias:    'clone-spot-price',
							describe: 'Create a clone of this Launch Configuration with the given spot price. The spot clone will have "_spot" appended to the name'
						})

						.demand(['launch-config', 'ami', 'instance-type', 'ssh-key-pair'])
						.example('nemesys create lc -r ap-southeast-1 -l test-lc -a my_ami_name -i c3.large -k key_name -I my_role -s my_sg -u ~/userdata.sh --region-user-data ~/region_userdata.sh -d /dev/sda1:ebs:24:gp2 /dev/sdb:ephemeral:ephemeral0 -S 0.02',
							'Creates a Launch Configuration with the given parameters, with a clone using spot instances at the given spot price');
				})

				.command('instance', 'Create an Instance', function (yargs, argv) {
					_common_args(yargs)

						.option('a', {
							alias:       'ami',
							description: 'AMI name'
						})
						.option('i', {
							alias:    'instance-type',
							describe: 'EC2 API name of the instance type to use (ie, m3.large)'
						})
						.option('k', {
							alias:    'ssh-key-pair',
							describe: 'Name of the ssh key pair to use for instances using this Launch Configuration'
						})
						.option('I', {
							alias:    'iam-role',
							describe: 'IAM role for launched instances'
						})
						.option('s', {
							alias:    'security-groups',
							describe: 'Name of the Security Group(s) to apply to instances using this Launch Configuration',
							array:    true
						})
						.option('u', {
							alias:    'user-data-files',
							describe: 'Shell script files to combine to form the user data',
							array:    true
						})
						.option('region-user-data', {
							describe: 'Region-specific user data files, which will appear BEFORE all other user data in the resulting script. This must be in the same order as the regions passed in via --regions',
							array:    true,
							default:  []
						})
						.option('d', {
							alias:    'disks',
							describe: 'Disks to attach to instances using this Launch Configuration',
							array:    true
						})
						.option('z', {
							alias:    'availability-zone',
							describe: 'Availability zone to launch the instance in. If more than one, will be used in order of regions arg',
							array:    true
						})
						.option('v', vpc_opt)
						.option('n', {
							alias:    'network-interface',
							describe: 'Name of existing Elastic Network Interface to attach to this instance'
						})
						.option('t', {
							alias:    'tags',
							describe: 'Tags to apply, in the form of Name=value',
							array:    true
						})
						.option('env', {
							describe: 'Environment variables to pass to the userdata',
							array:    true
						})
						.option('required-env', {
							describe: 'Environment variable that is required. This is meant to be used in config files to remind you to pass the --env needed',
							array:    true
						})
						.option('optimize-ebs', {
							describe: 'Use EBS optimization'
						})

						.demand(['ami', 'instance-type', 'ssh-key-pair', 'availability-zone', 'vpc'])
						.example('');
				})

				.command('ami', 'Create an AMI', function (yargs, argv) {
					_common_args(yargs)

					.option('a', {
						alias:       'ami',
						description: 'AMI name'
					})
					.option('b', {
						alias: 'base-ami',
						description: 'Name of the base AMI to build a new one on top of'
					})
					.option('i', {
						alias:    'instance-type',
						describe: 'EC2 API name of the instance type to use (ie, m3.large)'
					})
					.option('k', {
						alias:    'ssh-key-pair',
						describe: 'Name of the ssh key pair to use for instances using this Launch Configuration'
					})
					.option('I', {
						alias:    'iam-role',
						describe: 'IAM role for launched instances'
					})
					.option('s', {
						alias:    'security-groups',
						describe: 'Name of the Security Group(s) to apply to instances using this Launch Configuration',
						array:    true
					})
					.option('u', {
						alias:    'user-data-files',
						describe: 'Shell script files to combine to form the user data',
						array:    true
					})
					.option('region-user-data', {
						describe: 'Region-specific user data files, which will appear BEFORE all other user data in the resulting script. This must be in the same order as the regions passed in via --regions',
						array:    true,
						default:  []
					})
					.option('d', {
						alias:    'disks',
						describe: 'Disks to attach to instances using this Launch Configuration',
						array:    true
					})
					.option('z', {
						alias:    'availability-zone',
						describe: 'Availability zone to launch the instance in. If more than one, will be used in order of regions arg',
						array:    true
					})
					.option('v', vpc_opt)
					.option('preserve-instance', {
						describe: 'Keep instance running after creating AMI',
						type: 'boolean',
						default: false
					})

					.demand(['ami', 'base-ami', 'instance-type', 'ssh-key-pair', 'availability-zone', 'vpc'])
					.help('h')
					.alias('h', 'help');
				})

				.demand(2)
				.help('h')
				.alias('h', 'help');
		})

		.command('replace', 'Replace an existing EC2 resource with a new one', function (yargs, argv) {
			yargs

				.command('asg', 'Replace an Autoscaling Group', function (yargs, argv) {
					_common_args(yargs)
						.option('v', vpc_opt)
						.option('g', group_opt)
						.option('l', lc_opt)
						.option('o', {
							alias:    'old-group',
							describe: 'Name of the Autoscaling Group to replace. Only applies to `replace` command'
						})
						.demand(['vpc', 'group', 'launch-config', 'old-group'])
						.example('nemesys replace -o tracking_asg_2015_12_03 -g tracking_asg_2015_12_04 -l tracking_2015_12_04_spot -r eu-west-1',
							'Replaces ASG tracking_asg_2015_12_03 with a new one called tracking_asg_2015_12_04, with launch config tracking_2015_12_04_spot')
						.help('h')
						.alias('h', 'help')
				})

				.command('sg', 'Replace the rules on an existing Security Group', function (yargs, argv) {
					_common_args(yargs)
						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group'
						})
						.option('i', ingress_rules_opt)
						.demand(['security-group', 'ingress-rules'])
						.example('nemesys replace sg -s cassandra-node -i logconsumer-server:9042 -r us-east-1',
							'Replaces the rules in SG "cassandra-node" with just one rule allowing access from logconsumer-server on port 9042 (tcp)')
						.help('h')
						.alias('h', 'help')
				})

				.demand(2)
				.help('h')
				.alias('h', 'help');
		})

		.command('delete', 'Delete an EC2 resource', function (yargs, argv) {
			yargs

				.command('asg', 'Delete an Autoscaling Group', function (yargs, argv) {
					_common_args(yargs)
						.option('g', group_opt)
						.demand(['group'])
						.example('nemesys delete asg -v my_vpc -g my_asg')
						.help('h')
						.alias('h', 'help');
				})

				.command('lc', 'Delete a Launch Configuration', function (yargs, argv) {
					_common_args(yargs)

						.option('l', lc_opt)
						.option('D', {
							alias:    'delete-spot-clone',
							describe: 'Look for and delete the "spot clone" of this Launch Configuration',
							type:     'boolean'
						})

						.demand(['launch-config'])
						.example('nemesys delete lc -l test-lc -r ap-southeast-1 us-east-1');
				})

				.command('sg', 'Delete a Security Group', function (yargs, argv) {
					_common_args(yargs)

						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group'
						})

						.demand(['security-group'])
						.example('nemesys delete sg -s my-sg');
				})

				.demand(2)
				.help('h')
				.alias('h', 'help');
		})

		.demand(2)
		.help('h')
		.alias('h', 'help')
		.argv;

	_validate_dependent_args(argv);

	return argv;
}

function _validate_dependent_args(argv) {
	if (argv['required-env']) {
		let missing = [];

		if (!argv.env) {
			missing = argv['required-env'];
		} else {
			for (let v of argv['required-env']) {
				let found = false;
				for (let e of argv.env) {
					if (e.indexOf(v + '=') === 0) {
						found = true;
						break;
					}
				}
				if (!found) {
					missing.push(v);
				}
			}
		}

		if (missing.length > 0) {
			console.error('Missing required ENVs: ' + missing.join(', '));
			process.exit(1);
		}
	}
}

module.exports = {
	parse_args
};
