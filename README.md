#nemesys#

nemesys is a tool for managing EC2 resources in multiple regions.

Please note that while we use this internally on our team at Demandware, this is very much a beta piece of software. We appreciate any feedback!

The name nemesys is related to the Greek word νέμειν némein, meaning "to give what is due",[2] from Proto-Indo-European nem- "distribute". (https://en.wikipedia.org/wiki/nemesis_(mythology)). Unfortunately, the correct spelling 'nemesis' was already taken.

#Usage#
`nemesys -h`

You'll need a `regions.json` file, which should contain a mapping of regions to VPC ids. This is currently required, meaning nemesys only supports using EC2 with a VPC. Here is an example of what the file should look like:
```json
{
  "us-east-1": {
    "vpc": "{vpc_id}"
  },
  "us-west-2": {
    "vpc": "..."
  }
}
```

#Examples#
To replace an existing ASG:
```
nemesys replace asg -o old_asg_2015_12_04 -g new_asg_2015_12_07 -l launch_config_2015_12_03 -r eu-west-1 us-west-2 us-east-1
```
This will copy tags and autoscaling actions from old_asg_2015_12_04 to a new ASG called new_asg_2015_12_07, using launch config launch_config_2015_12_03 in the 3 regions specified

To create an ELB security group, allowing access from any ip:
```
nemesys create sg -s my-elb -i 0.0.0.0/0:80 0.0.0.0/0:443 -c ~/x6/Automation/nemesys/regions.json -r eu-west-1 us-west-2 us-east-1
```

To create a corresponding instance security group, only allowing access from the previous ELB group:
```
nemesys create sg -s my-instance -i tracking-elb:3000 -c ~/x6/Automation/nemesys/regions.json -r eu-west-1 us-west-2 us-east-1
```
