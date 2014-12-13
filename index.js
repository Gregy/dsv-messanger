var fs = require('fs');
var ini = require('ini');
var Communication = require('./communication.js');
var logger = require('./logger.js');
var readline = require('readline');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

var comm = new Communication(config.discovery.multicast_address, config.discovery.port, config.discovery.neighbor_ttl);

var commands = {
  help: {
    info: 'Lists this help',
    handler: function() {
      logger.systemMessage('List of implemented commands:');
      for(command in commands) {
        logger.systemMessage('/'+command+'  '+commands[command].info);
      }
    }
  },
  quit: {
    info: 'Gracefully end communication and exit.',
    handler: function() {
      comm.checkOut();
      logger.systemMessage('Gracefully exiting...');
      process.exit(0);
    }
  },
  fquit: {
    info: 'Forcefully exit without further communication.',
    handler: function() {
      logger.systemMessage('Forcefully exiting...');
      process.exit(0);
    }
  },
  neighbors: {
    info: 'List active neighbors.',
    handler: function() {
      logger.systemMessage('Active neighbors:');
      for(neighbor in comm.neighbors) {
        logger.systemMessage(comm.neighborToString(comm.neighbors[neighbor]));
      }
    }
  }
}

logger.systemMessage('Welcome to messanger. You are sitting at '+comm.hostname+'/'+comm.id);
logger.systemMessage('Type /help for list of commands or type your message and press <enter>');

var rl = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('> ');
rl.prompt();
rl.on('line', function(line) {
  if(line.charAt(0) === '/') {
    line = line.slice(1);
    if(commands.hasOwnProperty(line)) {
      commands[line].handler();
    }
    else {
      logger.systemMessage('Unknown command '+line);
    }
  }
  else {
    console.log(line);
  }
  rl.prompt();
})
rl.on('close',function(){
  commands.fquit.handler();
  process.exit(0);
});
