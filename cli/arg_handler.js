'use strict';

var nemesys = require('../');

function _handle(argv) {
  var regions_config = require(argv['regions-config']);

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

        default:
          console.log(`Unrecognized command: ${argv._[0]} ${argv._[1]}`);
          process.exit(1);
      }
      break;

    case 'replace':
      switch(argv._[1]) {
        case 'asg':
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
