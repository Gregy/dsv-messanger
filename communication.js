var hostname = require('os').hostname;
var dgram = require('dgram');
var logger = require('./logger.js');

module.exports = function(multicastAddr, port, ttl) {
  var self = this;
  this.port = port;
  this.ttl = ttl;
  this.neighbors = {};
  this.hostname = hostname();
  this.multicastAddr = multicastAddr;
  this.id =  Math.ceil(Math.random()*10000);

  this.packetPrototype = {
    type: 'something',
    hostname: this.hostname,
    id: this.id
  }

  this.socket = dgram.createSocket('udp4');
  this.socket.bind(port, function() {
    self.socket.addMembership(multicastAddr);
  });
  this.socket.on('message', function(msg, info) {
    try {
      var message = JSON.parse(msg.toString());
      if(message.hostname != self.hostname || message.id != self.id) {

        if(message.type === 'announce') {
          var newNeighbor = {
            hostname: message.hostname,
            id: message.id,
            address: info.address,
            port: info.port,
            ttl: self.ttl
          }
          if(!self.neighbors.hasOwnProperty(message.id+message.hostname)) {
            logger.info('Adding new node '+self.neighborToString(newNeighbor));
          }
          self.neighbors[message.id+message.hostname] = newNeighbor;
        }

        else if(message.type === 'goodbye') {
          if(self.neighbors.hasOwnProperty(message.id+message.hostname)) {
            logger.info('Graceful shutdown of node '+self.neighborToString(self.neighbors[message.id+message.hostname]));
            delete self.neighbors[message.id+message.hostname];
          }
        }

      }
    }
    catch(e) {
      console.log(logger.info('Error: '+e.message));
    }
  });

  // Check local neighbors table and remove stale entries
  this.staleRemover = setInterval(function() {
    for(var n in self.neighbors) {
      self.neighbors[n].ttl--;
      if(self.neighbors[n].ttl <=0) {
        logger.info('Node '+self.neighborToString(self.neighbors[n])+' left without telling us!');
        delete self.neighbors[n];
      }
    }
  }, 1000);
  
  // Periodically send announce packet
  this.announcer = setInterval(function() {
    self.sendAnnounce();
  }, 1000);
  this.sendAnnounce();
}

module.exports.prototype.checkOut = function() {
  clearInterval(this.announcer);
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'goodbye';
  var bpacket = new Buffer(JSON.stringify(packet));
  this.socket.send(bpacket, 0, bpacket.length, this.port, this.multicastAddr);
}

module.exports.prototype.sendAnnounce = function() {
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'announce';
  var bpacket = new Buffer(JSON.stringify(packet));
  this.socket.send(bpacket, 0, bpacket.length, this.port, this.multicastAddr);
}

module.exports.prototype.neighborToString = function(neighbor) {
  return neighbor.hostname+'/'+neighbor.id+'('+neighbor.address+':'+neighbor.port + ')';
}


