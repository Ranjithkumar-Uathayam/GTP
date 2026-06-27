'use strict';

const EventEmitter = require('events');

// Singleton bridge between lightControlService and light.socket.
// lightControlService  → emit('light-changed', { sessionId, stationId, lights })
// light.socket         → on('light-changed', ...)  → io.emit('station-light-update', ...)
module.exports = new EventEmitter();
