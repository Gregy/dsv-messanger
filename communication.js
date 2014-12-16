var hostname = require('os').hostname;
var dgram = require('dgram');

module.exports = function(multicastAddr, multicastPort, unicastPort, ttl, logger) {
  var self = this;
  this.logger = logger;
  this.unicastPort = unicastPort;
  this.multicastPort = multicastPort;
  this.ttl = ttl;
  this.holdingLock = false;
  this.wantToLock = false;
  this.lockTimestamp = null;
  this.lockCallback = null;
  this.clock = 0;
  this.neighbors = {};
  this.lockRequestQueue = [];
  this.hostname = hostname();
  this.multicastAddr = multicastAddr;
  this.id =  Math.ceil(Math.random()*10000);

  this.packetPrototype = {
    type: 'something',
    hostname: this.hostname,
    id: this.id
  }

  function handlePacket(msg, info) {
    try {
      var message = JSON.parse(msg.toString());
      //logger.info('Got message from '+message.hostname+'/'+message.id+' clock: '+message.clock);
      if(message.hostname != self.hostname || message.id != self.id) {
        //update logical clock
        if(message.clock > self.clock) {
          self.clock = message.clock;
        }
        self.clock++;

        //add to neighbour table if unknown, if known update ttl
        if(!self.neighbors.hasOwnProperty(message.id+message.hostname)) {
          var newNeighbor = {
            hostname: message.hostname,
            id: message.id,
            address: info.address,
            lockOk: false,
            port: info.port,
            ttl: self.ttl
          }
          logger.info('Adding new node '+self.neighborToString(newNeighbor));
          self.neighbors[message.id+message.hostname] = newNeighbor;
        }
        else {
          self.neighbors[message.id+message.hostname].ttl = self.ttl;
        }

        //ANNOUNCE MESSASGE
        if(message.type === 'announce') {
          //no need to do anything
        }

        //GOODBYE MESSASGE
        else if(message.type === 'goodbye') {
          logger.info('Graceful shutdown of node '+self.neighborToString(self.neighbors[message.id+message.hostname]));
          delete self.neighbors[message.id+message.hostname];
          self.lockCheck();
        }
        //LOCK REQEST MESSASGE
        else if(message.type === 'lock request') {
          logger.info('Got lock request from: '+self.neighborToString(self.neighbors[message.id+message.hostname]));
          self.lockRequestQueue.push({neighbor: message.id+message.hostname, timestamp: message.clock});
          self.lockRespond();
        }
        //LOCK OK MESSASGE
        else if(message.type === 'lock ok') {
          logger.info('Got lock ok from: '+self.neighborToString(self.neighbors[message.id+message.hostname]));
          self.neighbors[message.id+message.hostname].lockOk = true;
          self.lockCheck();
        }
        //MESSAGE
        else if(message.type === 'message') {
          self.logger.message(self.neighborToString(self.neighbors[message.id+message.hostname]), message.message);
        }
      }
    }
    catch(e) {
      console.log(logger.info('Error: '+e.message));
    }
  }
  
  var msocket = dgram.createSocket('udp4');
  msocket.bind(multicastPort, function() {
    msocket.addMembership(multicastAddr);
  });
  msocket.on('message', handlePacket);
  this.socket = dgram.createSocket('udp4');
  this.socket.bind(unicastPort);
  this.socket.on('message', handlePacket);

  // Check local neighbors table and remove stale entries
  this.staleRemover = setInterval(function() {
    for(var n in self.neighbors) {
      self.neighbors[n].ttl--;
      if(self.neighbors[n].ttl <=0) {
        logger.info('Node '+self.neighborToString(self.neighbors[n])+' left without telling us!');
        delete self.neighbors[n];
        self.lockCheck();
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
  packet.clock = ++this.clock;
  var bpacket = new Buffer(JSON.stringify(packet));
  this.socket.send(bpacket, 0, bpacket.length, this.multicastPort, this.multicastAddr);
}

module.exports.prototype.lock = function(callback) {
  this.lockCallback = callback;
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'lock request';
  packet.clock = ++this.clock;
  this.wantToLock = true;
  this.lockTimestamp = this.clock;
  var bpacket = new Buffer(JSON.stringify(packet));
  for(var neigh in this.neighbors) {
    var neighbor = this.neighbors[neigh];
    if(!neighbor.lockOk) {
      this.socket.send(bpacket, 0, bpacket.length, neighbor.port, neighbor.address);
      this.logger.info('Requesting lock from '+this.neighborToString(neighbor));
    }
  }

  setTimeout(this.lockCheck.bind(this), 500);
}
module.exports.prototype.unlock = function() {
  this.wantToLock = false;
  this.holdingLock = false;
  this.lockRespond();
}
module.exports.prototype.sendLockOk = function(neighbor) {
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'lock ok';
  packet.clock = ++this.clock;
  var bpacket = new Buffer(JSON.stringify(packet));
  this.neighbors[neighbor].lockOk = false;
  this.logger.info('Sending lock ok to: '+this.neighborToString(this.neighbors[neighbor]));
  this.socket.send(bpacket, 0, bpacket.length, this.neighbors[neighbor].port, this.neighbors[neighbor].address);
}

module.exports.prototype.sendAnnounce = function() {
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'announce';
  packet.clock = ++this.clock;
  var bpacket = new Buffer(JSON.stringify(packet));
  this.socket.send(bpacket, 0, bpacket.length, this.multicastPort, this.multicastAddr);
}

module.exports.prototype.sendMessage= function(message) {
  var packet = JSON.parse(JSON.stringify(this.packetPrototype));
  packet.type = 'message';
  packet.clock = ++this.clock;
  packet.message = message;
  var bpacket = new Buffer(JSON.stringify(packet));
  this.socket.send(bpacket, 0, bpacket.length, this.multicastPort, this.multicastAddr);
  this.logger.message('me', message);
}

module.exports.prototype.neighborToString = function(neighbor, short) {
  if(short||true) {
    return neighbor.hostname+'/'+neighbor.id;
  }
  return neighbor.hostname+'/'+neighbor.id+'('+neighbor.address+':'+neighbor.port + ')';
}

module.exports.prototype.lockRespond= function() {
  //if holding lock do not respond to anyone
  if(this.holdingLock) {
    return false;
  }
  //if want to lock respond only to lower timestamps
  if(this.wantToLock == true) {
    this.lockRequestQueue.forEach(function(lockRequest, index) {
      if(lockRequest.timestamp < this.lockTimestamp || 
         (lockRequest.timestamp == this.lockTimestamp && this.neighbors[lockRequest.neighbor].id < this.id)) {
        this.sendLockOk(lockRequest.neighbor);
        this.lockRequestQueue.splice(index,1);
      }
    }, this);
  }
  //send ok to everyone
  else {
    this.lockRequestQueue.forEach(function(lockRequest, index) {
      this.sendLockOk(lockRequest.neighbor);
      this.lockRequestQueue.splice(index,1);
    }, this);
  }

}

module.exports.prototype.lockCheck= function() {
  if(!this.wantToLock || this.holdingLock) {
    return;
  }
  var blocked = false;
  var blockedBy = '';
  for(var neigh in this.neighbors) {
    var neighbor = this.neighbors[neigh];
    if(!neighbor.lockOk) {
      blocked = true;
      blockedBy += ','+this.neighborToString(neighbor, true);
    }
  }
  if(blocked) {
    this.logger.info('Blocked by: '+blockedBy.slice(1));
  }
  else {
    this.holdingLock = true;
    if(this.lockCallback) {
      this.lockCallback();
    }
    this.lockCallback = null;
  }
}

module.exports.prototype.getLogicalClock = function() {
  return this.clock;
}


