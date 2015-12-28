'use strict';

var nemesys = require('../');

function _handle(argv) {

  switch(argv._[0]) {
    case 'update':

      switch(argv._[1]) {
        case 'asg':
          nemesys.asg.update(
            argv['regions'],
            argv['group'],
            argv['launch-config']
          ).then(function(result){
            console.log('update complete');
            process.exit(0);
          }).catch(function(err){
            console.error(err.stack);
            process.exit(1);
          });
          break;
        default:
          console.log(`Unrecognized command: ${argv._[0]} ${argv._[1]}`);
          process.exit(1);
      }
      break;

    case 'create':
      switch(argv._[1]) {

        case 'asg':
          var regions_config = require(argv['regions-config']);
          nemesys.asg.create(
            regions_config,
            argv['regions'],
            argv['group'],
            argv['launch-config'],
            argv['instance-tags'],
            argv['error-topic']
          ).then(function(result){
            console.log('create complete');
            process.exit(0);
          }).catch(function(err){
            console.error(err.stack);
            process.exit(1);
          });
          break;

        case 'sg':
          var regions_config = require(argv['regions-config']);
          nemesys.sg.create(
            regions_config,
            argv['regions'],
            argv['security-group'],
            argv['description'],
            argv['ingress-rules']
          ).then(function(result){
            console.log('create complete');
            process.exit(0);
          }).catch(function(err){
            console.error(err.stack);
            process.exit(1);
          });
          break;

        case 'lc':
          nemesys.lc.create(
            argv['regions'],
            argv['launch-config'],
            argv['ami'],
            argv['instance-type'],
            argv['ssh-key-pair'],
            argv['security-groups'],
            argv['iam-role'],
            argv['user-data-files'],
            argv['region-user-data'],
            argv['disks'],
            argv['clone-spot-price']
          ).then(function(){
            console.log('created launch configuration');
            process.exit(0);
          }).catch(function(err){
            console.error(err.stack);
            process.exit(1);
          });
          break;

        default:
          console.log(`Unrecognized command: ${argv._[0]} ${argv._[1]}`);
          process.exit(1);
      }
      break;

    case 'replace':
      switch(argv._[1]) {
        case 'asg':
          var regions_config = require(argv['regions-config']);
          nemesys.asg.replace(
            regions_config,
            argv['regions'],
            argv['old-group'],
            argv['group'],
            argv['launch-config']
          ).then(function(result){
            console.log('replace complete');
            process.exit(0);
          }).catch(function(err){
            console.error(err.stack);
            process.exit(1);
          });
          break;
      default:
        console.log(`Unrecognized command: ${argv._[0]} ${argv._[1]}`);
        process.exit(1);
      }
      break;
    default:
      console.log(`Unrecognized command: ${argv._[0]}`);
      process.exit(1);
  }
}

exports.handle = _handle;
