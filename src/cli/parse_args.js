#!/usr/bin/env node
'use strict';
//TODO use yargs auto completion feature!

const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

const Logger = require('../logger');

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
			choices: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'], // TODO - let's not hardcode this :) http://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeRegions.html
			demandOption: true
		})
		.config('json-config')
		.config('yaml-config', function(config_path){
			return yaml.safeLoad(fs.readFileSync(config_path));
		})
		.conflicts('json-config', 'yaml-config');
}

function parse_args (args) {
	let yargs;
	if(args) {
		yargs = require('yargs')(args);
	} else {
		yargs = require('yargs');
	}
	let argv = yargs
		.usage('nemesys {command} {target} [options]')
		// commands

		.command('update', 'Update an EC2 resource', function (yargs) {
			yargs

				.command('asg', 'Update an Autoscaling Group with a new Launch Configuration', function (yargs) {
					_common_args(yargs)

						.option('g', group_opt)
						.option('l', lc_opt)
						.demandOption(['g', 'l'], 'Please provide an autoscaling group and launch config')
						.example('nemesys update asg -g tracking_asg -l tracking_lc_2015_12_03 -r us-east-1 us-west-2',
							'Updates the launch config for an ASG called tracking_asg to be tracking_lc_2015_12_03 in us-east-1, us-west-2, and eu-west-1')
						.help('h')
						.alias('h', 'help');
				})

				.command('sg', 'Update a Security Group', function (yargs) {
					_common_args(yargs)

						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group',
							demandOption: true
						})
						.option('i', {
							alias:    'ingress-rules',
							describe: 'Security Group ingress rules, in the format of {ip/group name}:{port}[:{protocol}]. Default protocol is tcp',
							type:     'array'
						})
						.option('remove', {
							describe: 'Use this flag to remove, instead of add, the specified rules',
							type:     'boolean'
						});
				})

				.demandCommand(2)

				.help('h')
				.alias('h', 'help');
		})

		.command('create', 'Create an AWS resource', function (yargs) {
			yargs

				.command('asg', 'Create an Autoscaling Group', function (yargs) {
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
						.demandOption(['v', 'g', 'l'], 'Please provide a VPC, autoscaling group, and launch config')
						.example('nemesys create asg -v my_vpc -g tracking_asg -l tracking_lc -t Client=all -t Name=tracking-asg -t Task=tracking -e cq-pixel-error -r us-west-2',
							'Creates a new ASG in us-west-2 called tracking_asg with launch config tracking_lc, error topic "cq-pixel-error", and some tags')
						.help('h')
						.alias('h', 'help');
				})

				.command('alb', 'Create an Application Load Balancer', function (yargs) {
					_common_args(yargs)

						.option('v', vpc_opt)
						.option('name', {
							alias: 'n',
							describe: 'Name of ALB',
						})
						.option('security-group', {
							alias: 's',
							describe: 'Security Group name new ALB should be tied to.'
						})
						.option('target-groups', {
							alias: 's',
							describe: 'JSON string of array of target groups (just use a file!)'
						})
						.option('ssl-config', {
							alias: 's',
							describe: 'JSON string of ssl config map (just use a file!)'
						})
						.option('options', {
							alias: 's',
							describe: 'JSON string of options map (just use a file!)'
						})
						.demandOption(['v', 'name', 'security-group'], 'Please provide a VPC, ALB name, and security group');
				})

				.command('sg', 'Create a Security Group', function (yargs) {
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
						.demandOption(['v', 's'], 'Please provide a VPC and security group')
						.example('nemesys create sg -s ssh-access -c ~/x6/Automation/nemesys/regions.json -r ap-southeast-1',
							'Creates a security group in ap-southeast-1 called "ssh-access", using regions.json to discover the vpc to use');
				})

				.command('lc', 'Create a Launch Configuration', function (yargs) {
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
							array:    true
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
						.demandOption(['l', 'a', 'i', 'k'], 'Please provide a launch config, AMI name, instance type, and ssh key-pair')
						.example('nemesys create lc -r ap-southeast-1 -l test-lc -a my_ami_name -i c3.large -k key_name -I my_role -s my_sg -u ~/userdata.sh --region-user-data ~/region_userdata.sh -d /dev/sda1:ebs:24:gp2 /dev/sdb:ephemeral:ephemeral0 -S 0.02',
							'Creates a Launch Configuration with the given parameters, with a clone using spot instances at the given spot price');
				})

				.command('instance', 'Create an Instance', function (yargs) {
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
						.option('v', vpc_opt)
						.option('z', {
							alias:    'availability-zone',
							describe: 'Availability zone to launch the instance in. If more than one, will be used in order of regions arg',
							array:    true
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
							array:    true
						})
						.option('d', {
							alias:    'disks',
							describe: 'Disks to attach to instances using this Launch Configuration',
							array:    true
						})
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
						.option('e', {
							alias:    'elastic-ips',
							describe: 'The elastic IPs to use (per AZ/Region). We won\'t detach it if in use unless reassociate-eip is true',
							array:    true
						})
						.option('p', {
							alias:    'reassociate-eip',
							describe: 'If true we\'ll detach the EIP from the existing instance.',
							type:     'boolean',
							default:  false
						})
						.demandOption(['a', 'i', 'k', 'v', 'z'], 'Please provide an AMI name, instance type, ssh key-pair, VPC, and availability zone')
						.example('');
				})

				.command('ami', 'Create an AMI', function (yargs) {
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
						.option('z', {
							alias:    'availability-zone',
							describe: 'Availability zone to launch the instance in. If more than one, will be used in order of regions arg',
							array:    true
						})
						.option('v', vpc_opt)
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
							array:    true
						})
						.option('d', {
							alias:    'disks',
							describe: 'Disks to attach to instances using this Launch Configuration',
							array:    true
						})
						.option('preserve-instance', {
							describe: 'Keep instance running after creating AMI',
							type: 'boolean',
							default: false
						})
						.option('create-in-all-regions', {
							describe: 'Create an instance in each region for image creation, instead of create one instance and copy to other regions',
							type: 'boolean',
							default: false
						})
						.demandOption(['a', 'b', 'i', 'k', 'z', 'v'], 'Please provide an AMI name, base AMI, instance type, ssh key-pair, VPC, and availability zone')
						.help('h')
						.alias('h', 'help');
				})

				.demandCommand(2)
				.help('h')
				.alias('h', 'help');
		})

		.command('replace', 'Replace an existing EC2 resource with a new one', function (yargs) {
			yargs

				.command('asg', 'Replace an Autoscaling Group', function (yargs) {
					_common_args(yargs)

						.option('v', vpc_opt)
						.option('g', group_opt)
						.option('l', lc_opt)
						.option('o', {
							alias:    'old-group',
							describe: 'Name of the Autoscaling Group to replace. Only applies to `replace` command'
						})
						.demandOption(['v', 'g', 'l', 'o'], 'Please provide a VPC, autoscaling group, launch configuration, and the old autoscaling group')
						.example('nemesys replace -o tracking_asg_2015_12_03 -g tracking_asg_2015_12_04 -l tracking_2015_12_04_spot -r eu-west-1',
							'Replaces ASG tracking_asg_2015_12_03 with a new one called tracking_asg_2015_12_04, with launch config tracking_2015_12_04_spot')
						.help('h')
						.alias('h', 'help');
				})

				.command('sg', 'Replace the rules on an existing Security Group', function (yargs) {
					_common_args(yargs)

						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group'
						})
						.option('i', ingress_rules_opt)
						.demandOption(['s', 'i'], 'Please provide a security group and ingress rules')
						.example('nemesys replace sg -s cassandra-node -i logconsumer-server:9042 -r us-east-1',
							'Replaces the rules in SG "cassandra-node" with just one rule allowing access from logconsumer-server on port 9042 (tcp)')
						.help('h')
						.alias('h', 'help');
				})

				.command('instance', 'Replace instance with another', function (yargs) {
					_common_args(yargs)

						.option('s', {
							alias:    'source',
							describe: 'Source instance name'
						})
						.option('t', {
							alias:    'target',
							describe: 'Target instance name'
						})
						.option('i', ingress_rules_opt)
						.demandOption(['s', 't'], 'Please provide a source and target instance name')
						.example('nemesys replace instance -s source-instance-name -t target-instance-name -r us-east-1', 'Replaces target instance with src instance')
						.help('h')
						.alias('h', 'help');
				})

				.demandCommand(2)
				.help('h')
				.alias('h', 'help');
		})

		.command('delete', 'Delete an EC2 resource', function (yargs) {
			yargs
				.command('asg', 'Delete an Autoscaling Group', function (yargs) {
					_common_args(yargs)

						.option('g', group_opt)
						.demandOption(['g'], 'Please provide an autoscaling group')
						.example('nemesys delete asg -v my_vpc -g my_asg')
						.help('h')
						.alias('h', 'help');
				})

				.command('lc', 'Delete a Launch Configuration', function (yargs) {
					_common_args(yargs)

						.option('l', lc_opt)
						.option('D', {
							alias:    'delete-spot-clone',
							describe: 'Look for and delete the "spot clone" of this Launch Configuration',
							type:     'boolean'
						})
						.demandOption(['l'], 'Please provide a launch configuration')

						.example('nemesys delete lc -l test-lc -r ap-southeast-1 us-east-1');
				})

				.command('sg', 'Delete a Security Group', function (yargs) {
					_common_args(yargs)

						.option('s', {
							alias:    'security-group',
							describe: 'Name of the Security Group',
							demandOption: true
						})

						.example('nemesys delete sg -s my-sg');
				})

				.command('ami', 'Delete an AMI', function(yargs){
					_common_args(yargs)

						.option('a', {
							alias:       'ami',
							description: 'AMI name',
							demandOption: true
						})

						.example('nemesys delete ami -r us-east-1 us-west-2 -a my-old-ami');
				})

				.demandCommand(2)
				.help('h')
				.alias('h', 'help');
		})

		.command('copy', 'Copy an EC2 resource', function (yargs) {
			yargs
				.command('instance', 'Copy an instance', function (yargs) {
					_common_args(yargs)

						.option('i', {
							alias: 'instance',
							describe: 'Instance name'
						})
						.option('n', {
							alias: 'rename',
							describe: 'New instance name'
						})
						.option('a', {
							alias:       'ami',
							description: 'AMI name'
						})
						.option('b', {
							alias: 'base-ami',
							description: 'Name of the base AMI to override with'
						})
						.option('t', {
							alias:    'instance-type',
							describe: 'EC2 API name of the instance type to use on the copied instance (ie, m3.large)'
						})
						.option('k', {
							alias:    'ssh-key-pair',
							describe: 'Name of the ssh key pair to use for instances using this Launch Configuration'
						})
						.option('I', {
							alias:    'iam-role',
							describe: 'IAM role to use on the copied instance'
						})
						.option('s', {
							alias:    'security-groups',
							describe: 'Name of the Security Group(s) to apply to instances using this Launch Configuration',
							array:    true
						})
						.option('u', {
							alias:    'user-data-files',
							describe: 'Shell script files to combine to form the user data on the copied instance',
							array:    true
						})
						.option('region-user-data', {
							describe: 'Region-specific user data files, which will appear BEFORE all other user data in the resulting script. This must be in the same order as the regions passed in via --regions',
							array:    true
						})
						.option('d', {
							alias:    'disks',
							describe: 'Disks to attach to the copied instance using this Launch Configuration',
							array:    true
						})
						.option('z', {
							alias:    'availability-zone',
							describe: 'Availability zone to launch the copied instance in. If more than one, will be used in order of regions arg',
							array:    true
						})
						.option('v', vpc_opt)
						.option('preserve-instance', {
							describe: 'Keep instance running after creating AMI',
							type: 'boolean',
							default: false
						})
						.option('T', {
							alias:    'tags',
							describe: 'Tags to apply, in the form of Name=value',
							array:    true
						})
						.demandOption(['i', 'n'], 'Please provide an instance name and a new instance name')
						.example('nemesys copy instance -i instance-name -n new-instance-name -r us-east-1 -t m4.2xlarge')
						.help('h')
						.alias('h', 'help');
				});
		})
		.demandCommand(2)
		.help('h')
		.alias('h', 'help')
		.argv;

	let dir = argv['json-config'] ? path.dirname(argv['json-config']) : __dirname;

	['user-data-files', 'region-user-data'].forEach((path_arg) => {
		if(argv[path_arg]) {
			argv[path_arg] = argv[path_arg].map((file) => {
				return path.resolve(dir, file);
			});
		}
	});

	let command = {
		command: argv._[0],
		target:  argv._[1],
		opts:    argv
	};

	if (!_validate_dependent_args(command.opts)) {
		process.exit(1);
	}

	return command;
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
			Logger.error('Missing required ENVs: ' + missing.join(', '));
			return false;
		}
	}
	return true;
}

module.exports = {
	parse_args
};
