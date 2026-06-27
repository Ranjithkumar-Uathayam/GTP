'use strict';

const svc = require('../services/lightControlService');

async function getLightStatus(req, res, next) {
  try {
    const { stationId } = req.params;
    const { sessionId } = req.query;
    const lights = await svc.getLightStatus(stationId, sessionId || null);
    res.json({ success: true, data: lights });
  } catch (err) { next(err); }
}

async function resetLights(req, res, next) {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });
    await svc.resetStationLights(parseInt(sessionId));
    res.json({ success: true, message: 'Lights reset' });
  } catch (err) { next(err); }
}

module.exports = { getLightStatus, resetLights };
