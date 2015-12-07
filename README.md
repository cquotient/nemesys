Nemesis is a tool for managing EC2 Autoscaling Groups in multiple regions.

The name Nemesis is related to the Greek word νέμειν némein, meaning "to give what is due",[2] from Proto-Indo-European nem- "distribute". (https://en.wikipedia.org/wiki/Nemesis_(mythology))

#Usage#
`nemesis -h`

#Examples#
To replace an existing Tracking ASG:
```
nemesis replace -o tracking_asg_2015_12_04 -g tracking_asg_2015_12_07 -l tracking_2015_12_03 -r eu-west-1 us-west-2 us-east-1
```
This will copy tags and autoscaling actions from tracking_asg_2015_12_04 to a new ASG called tracking_asg_2015_12_07, using launch config tracking_2015_12_03 in the 3 regions specified
