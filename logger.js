var colors = require('colors/safe');

module.exports = {
  info: function(message) {
    console.log(colors.grey(message));
  },
  systemMessage: function(message) {
    console.log(colors.green(message));
  },
  message: function(message) {
    console.log(colors.white(message));
  }
}
