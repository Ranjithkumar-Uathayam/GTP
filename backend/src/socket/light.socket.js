'use strict';

const lightEvents = require('../services/lightEvents');
const logger      = require('../utils/logger');

function init(io) {
  // Forward every light-changed event to all Socket.IO clients
  lightEvents.on('light-changed', (payload) => {
    io.emit('station-light-update', payload);
    logger.info(`[LIGHT socket] station-light-update → station=${payload.stationId} session=${payload.sessionId} lights=${payload.lights?.length ?? 0}`);
  });

  // On connection: client can request current light status for a station
  io.on('connection', (socket) => {
    socket.on('request-lights', async ({ stationId, sessionId } = {}) => {
      try {
        const svc    = require('../services/lightControlService');
        const lights = await svc.getLightStatus(stationId || 'STN-01', sessionId || null);
        socket.emit('station-light-update', { stationId: stationId || 'STN-01', sessionId: sessionId || null, lights });
      } catch (err) {
        logger.error('[LIGHT socket] request-lights error:', err.message);
      }
    });
  });

  logger.info('[LIGHT socket] Initialized — listening for light-changed events');
}

module.exports = { init };
