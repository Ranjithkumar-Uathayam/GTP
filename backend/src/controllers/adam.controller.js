'use strict';

const adam   = require('../services/Adam6052Service');
const logger = require('../utils/logger');

// ── GET /api/adam/status ──────────────────────────────────────────────────────
// Returns polling cache (no Modbus round-trip).
function getStatus(req, res) {
  res.json(adam.getStatus());
}

// ── GET /api/adam/check ───────────────────────────────────────────────────────
// Network diagnostics: ping + TCP port probe.
async function checkConnection(req, res, next) {
  try {
    res.json(await adam.checkConnection());
  } catch (err) {
    logger.error('[ADAM ctrl] checkConnection:', err.message);
    next(err);
  }
}

// ── GET /api/adam/connection ──────────────────────────────────────────────────
// Runtime connection state (lightweight, sync).
function getConnection(req, res) {
  res.json({
    connected:         adam.isConnected,
    reconnectAttempts: adam.reconnectAttempts,
    lastError:         adam.lastError,
    ip:                process.env.ADAM_IP      || '10.0.210.87',
    port:              process.env.ADAM_PORT    || '502',
    unitId:            process.env.ADAM_UNIT_ID || '1',
    protocol:          'Modbus TCP',
  });
}

// ── GET /api/adam/input ───────────────────────────────────────────────────────
// Live FC02 read — 12 DI channels.
async function readInput(req, res, next) {
  try {
    res.json(await adam.readInputs());
  } catch (err) {
    logger.error('[ADAM ctrl] readInput:', err.message);
    next(err);
  }
}

// ── GET /api/adam/output ──────────────────────────────────────────────────────
// Live FC01 read — 8 DO channels.
async function readOutput(req, res, next) {
  try {
    res.json(await adam.readOutputs());
  } catch (err) {
    logger.error('[ADAM ctrl] readOutput:', err.message);
    next(err);
  }
}

// ── POST /api/adam/output ─────────────────────────────────────────────────────
// Write DO. Body options:
//   { channel: 0, state: true }   → FC05 single coil
//   { value: 255 }                → FC15 all coils (bitmask 0–255)
async function writeOutput(req, res, next) {
  try {
    const { channel, state, value } = req.body;

    if (value !== undefined) {
      const mask = parseInt(value, 10);
      if (isNaN(mask) || mask < 0 || mask > 255) {
        return res.status(400).json({ error: 'value must be an integer 0–255' });
      }
      return res.json(await adam.writeAllOutputs(mask));
    }

    if (channel !== undefined) {
      const ch = parseInt(channel, 10);
      if (isNaN(ch) || ch < 0 || ch > 7) {
        return res.status(400).json({ error: 'channel must be 0–7' });
      }
      return res.json(await adam.writeSingleOutput(ch, Boolean(state)));
    }

    res.status(400).json({ error: 'Provide { channel, state } or { value }' });
  } catch (err) {
    logger.error('[ADAM ctrl] writeOutput:', err.message);
    next(err);
  }
}

// ── POST /api/adam/output/:channel/on ─────────────────────────────────────────
async function channelOn(req, res, next) {
  try {
    const ch = parseInt(req.params.channel, 10);
    if (isNaN(ch) || ch < 0 || ch > 7) {
      return res.status(400).json({ error: 'Channel must be 0–7' });
    }
    res.json(await adam.writeSingleOutput(ch, true));
  } catch (err) {
    logger.error('[ADAM ctrl] channelOn:', err.message);
    next(err);
  }
}

// ── POST /api/adam/output/:channel/off ────────────────────────────────────────
async function channelOff(req, res, next) {
  try {
    const ch = parseInt(req.params.channel, 10);
    if (isNaN(ch) || ch < 0 || ch > 7) {
      return res.status(400).json({ error: 'Channel must be 0–7' });
    }
    res.json(await adam.writeSingleOutput(ch, false));
  } catch (err) {
    logger.error('[ADAM ctrl] channelOff:', err.message);
    next(err);
  }
}

// ── POST /api/adam/output/all ─────────────────────────────────────────────────
// Body: { value: 255 } or { hex: "FF" }
async function setAll(req, res, next) {
  try {
    const { value, hex } = req.body;
    let mask;

    if (hex !== undefined) {
      if (!/^[0-9A-Fa-f]{1,2}$/.test(String(hex))) {
        return res.status(400).json({ error: 'hex must be 1–2 hex digits' });
      }
      mask = parseInt(String(hex), 16);
    } else if (value !== undefined) {
      mask = parseInt(value, 10);
      if (isNaN(mask) || mask < 0 || mask > 255) {
        return res.status(400).json({ error: 'value must be 0–255' });
      }
    } else {
      return res.status(400).json({ error: 'Provide { value } or { hex }' });
    }

    res.json(await adam.writeAllOutputs(mask));
  } catch (err) {
    logger.error('[ADAM ctrl] setAll:', err.message);
    next(err);
  }
}

module.exports = {
  getStatus,
  checkConnection,
  getConnection,
  readInput,
  readOutput,
  writeOutput,
  channelOn,
  channelOff,
  setAll,
};
