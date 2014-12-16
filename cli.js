var colors = require('colors/safe');
var readline = require('readline');


module.exports = function(commands) {
  var self = this;
  this.prependCallback = null;
  var rl = readline.createInterface(process.stdin, process.stdout);
  this.rl = rl;
  rl.setPrompt('> ');
  rl.prompt();
  rl.on('line', function(line) {
    if(line.charAt(0) === '/') {
      line = line.slice(1);
      var spaceIdx =  line.indexOf(' ');
      var command = '';
      spaceIdx>0?command = line.slice(0,spaceIdx):command = line;
      var parameter = line.slice(spaceIdx+1);
      if(commands.hasOwnProperty(command)) {
        commands[command].handler(parameter);
      }
      else {
        self.systemMessage('Unknown command '+command);
      }
    }
    else {
      commands.msg.handler(line);
    }
    rl.prompt();
  })
  rl.on('close',function(){
    commands.fquit.handler();
    process.exit(0);
  });
}

module.exports.prototype.print = function(message) {
  readline.clearLine(process.stdout, 0)
  readline.cursorTo(process.stdout, 0)
  console.log(message);
  this.rl.prompt(true);
}
module.exports.prototype.info = function(message) {
  var prepend = '';
  if(this.prependCallback) {
    prepend = colors.yellow(this.prependCallback());
    prepend += ' ';
  }
  this.print(prepend+colors.grey(message));
};
module.exports.prototype.systemMessage = function(message) {
  this.print(colors.green(message));
};
module.exports.prototype.message = function(remote,message) {
  var prepend = '';
  if(this.prependCallback) {
    prepend = colors.yellow(this.prependCallback());
    prepend += ' ';
  }
  this.print(prepend+colors.white.underline(remote) + ': '+colors.white(message));
};
