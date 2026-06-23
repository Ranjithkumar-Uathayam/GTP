'use strict';

const adam   = require('../services/Adam6052Service');
const logger = require('../utils/logger');

function init(io) {
  const adamNs = io.of('/adam');

  // Forward every service event to all connected Socket.IO clients.
  // Fires on every poll (1 s) AND on connect/reconnect/error state changes.
  adam.on('status', (payload) => {
    adamNs.emit('adam-status', payload);
    io.emit('adam-status', payload);          // root '/' namespace — Angular client
  });

  // ── /adam namespace (optional — for clients that join /adam explicitly) ──
  adamNs.on('connection', (socket) => {
    logger.info(`[ADAM socket] /adam client connected  (id: ${socket.id})`);
    socket.emit('adam-status', adam.getStatus());
    socket.on('request-status', () => socket.emit('adam-status', adam.getStatus()));
    socket.on('disconnect', () =>
      logger.info(`[ADAM socket] /adam client disconnected (id: ${socket.id})`)
    );
  });

  // ── Root '/' namespace — Angular service connects here ────────────────────
  io.on('connection', (socket) => {
    logger.info(`[ADAM socket] Root client connected   (id: ${socket.id})`);
    // Push current state immediately — Angular won't wait for the next poll tick
    socket.emit('adam-status', adam.getStatus());
    socket.on('request-status', () => socket.emit('adam-status', adam.getStatus()));
    socket.on('disconnect', () =>
      logger.info(`[ADAM socket] Root client disconnected (id: ${socket.id})`)
    );
  });

  logger.info('[ADAM socket] Initialized — status pushed on connect + every poll');
}

module.exports = { init };
