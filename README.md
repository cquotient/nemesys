nemesys is a tool for managing EC2 resources in multiple regions.

The name nemesys is related to the Greek word νέμειν némein, meaning "to give what is due",[2] from Proto-Indo-European nem- "distribute". (https://en.wikipedia.org/wiki/nemesis_(mythology)). Unfortunately the correct spelling 'nemesis' was already taken

#Usage#
`nemesys -h`

#Examples#
To replace an existing Tracking ASG:
```
nemesys replace asg -o tracking_asg_2015_12_04 -g tracking_asg_2015_12_07 -l tracking_2015_12_03 -r eu-west-1 us-west-2 us-east-1
```
This will copy tags and autoscaling actions from tracking_asg_2015_12_04 to a new ASG called tracking_asg_2015_12_07, using launch config tracking_2015_12_03 in the 3 regions specified

To create an ELB security group, allowing access from any ip:
```
nemesys create sg -s tracking-elb -i 0.0.0.0/0:80 0.0.0.0/0:443 -c ~/x6/Automation/nemesys/regions.json -r ap-southeast-1
```

To create a corresponding instance security group, only allowing access from the previous ELB group:
```
nemesys create sg -s tracking-server -i tracking-elb:3000 -c ~/x6/Automation/nemesys/regions.json -r ap-southeast-1
```
