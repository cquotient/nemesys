# nemesys [![Build Status](https://travis-ci.org/cquotient/nemesys.svg)](https://travis-ci.org/cquotient/nemesys)

nemesys is a tool for managing EC2 resources in multiple regions. It is built on the simple assumption that these resources have the same name in every region.

Please note that while we use this internally on our team at Demandware, this is very much a beta piece of software. We appreciate any feedback!

# Usage
```
npm install -g nemesys
nemesys --help
```

# Examples
To create a Launch Configuration:
```
nemesys create lc -r ap-southeast-1 -l test-lc -a my_ami_name -i c3.large -k key_name -I my_role -s my_sg -u ~/userdata.sh --region-user-data ~/region_userdata.sh -d /dev/sda1:ebs:24:gp2 /dev/sdb:ephemeral:ephemeral0 -S 0.02
```
This will create two Launch Configurations. Both will have the same parameters, but one will have a spot price and '\_spot' appended to the name

To replace an existing ASG:
```
nemesys replace asg -o old_asg_2015_12_04 -g new_asg_2015_12_07 -l launch_config_2015_12_03 -r eu-west-1 us-west-2 us-east-1
```
This will copy tags and autoscaling actions from old_asg_2015_12_04 to a new ASG called new_asg_2015_12_07, using launch config launch_config_2015_12_03 in the 3 regions specified

To create an ELB security group, allowing access from any ip:
```
nemesys create sg -s my-elb -i 0.0.0.0/0:80 0.0.0.0/0:443 -r eu-west-1 us-west-2 us-east-1 -v my_vpc
```

To create a corresponding instance security group, only allowing access from the previous ELB group:
```
nemesys create sg -s my-instance -i tracking-elb:3000 -r eu-west-1 us-west-2 us-east-1 -v my_vpc
```

To delete a security group:
```
nemesys delete sg -s my-instance -r eu-west-1 us-west-2 us-east-1
```
