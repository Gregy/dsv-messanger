var fs = require('fs');
var ini = require('ini');
var Communication = require('./communication.js');
var Cli = require('./cli.js');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
var commands = {};
var cli = new Cli(commands);
var minport = parseInt(config.communication.port_min, 10);
var maxport = parseInt(config.communication.port_max, 10);
var port = Math.ceil(minport + (Math.random()*(maxport-minport)));
var comm = new Communication(config.discovery.multicast_address, config.discovery.port, port, config.discovery.neighbor_ttl, cli);

commands.help = {
  info: 'Lists this help',
  handler: function() {
    cli.systemMessage('List of implemented commands:');
    for(command in commands) {
      cli.systemMessage('  /'+command+'  '+commands[command].info);
    }
  }
};
commands.quit = {
  info: 'Gracefully end communication and exit.',
  handler: function() {
    comm.checkOut(function(){
      cli.systemMessage('Gracefully exiting...');
      process.exit(0);
    });
  }
};
commands.fquit = {
  info: 'Forcefully exit without further communication.',
  handler: function() {
    cli.systemMessage('Forcefully exiting...');
    process.exit(0);
  }
};
commands.neighbors = {
  info: 'List active neighbors.',
  handler: function() {
    cli.systemMessage('Active neighbors:');
    for(neighbor in comm.neighbors) {
      cli.systemMessage(' '+comm.neighborToString(comm.neighbors[neighbor]));
    }
  }
};
commands.lock = {
  info: 'Get global lock and keep it until instructed to release.',
  handler: function() {
    if(comm.holdingLock) {
      cli.systemMessage('Already got a lock.');
      return;
    }
    if(comm.wantToLock) {
      cli.systemMessage('Lock already requested. You have to be patient.');
      return;
    }
    comm.lock(function() {
      cli.systemMessage('Now got lock!');
    });
  }
};
commands.unlock = {
  info: 'Release global lock.',
  handler: function() {
    cli.systemMessage('Lock is released.');
    comm.unlock();
  }
};
commands.msg = {
  info: 'Send message to other nodes. Type the text of the message after the command (/msg <text>).\n'+
        '        This command aquires lock, sends the message and releases the lock. If the lock is already aquired it will not be released.\n'+
        '        Note that this is the implicit command. You do not need to specify it. Just type your message and hit enter.',
  handler: function(message) {
    if(message.length > 1000) {
      cli.systemMessage('Message too long! It has to be shorter then 1000 characters. (I am afraid of MTU)');
      return;
    }
    if(comm.lockCallback) {
      cli.systemMessage('Action is already scheduled. You have to wait before scheduling another one.');
      return;
    }
    if(comm.holdingLock) {
      comm.sendMessage(message);
    }
    else {
      comm.lock(function() {
        comm.sendMessage(message);
        comm.unlock();
      });
    }
  }
};

cli.systemMessage('Welcome to messanger. You are sitting at '+comm.hostname+'/'+comm.id +' and listening on port '+port);
cli.systemMessage('Type /help for list of commands or type your message and press <enter>');
cli.prependCallback = comm.getLogicalClock.bind(comm);
