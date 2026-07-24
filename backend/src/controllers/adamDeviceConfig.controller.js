'use strict';

const svc           = require('../services/adamDeviceConfigService');
const deviceManager = require('../services/adamDeviceManager');

async function listAll(req, res, next) {
    try {
        res.json({ success: true, data: await svc.listAll() });
    } catch (err) { next(err); }
}

async function getByCode(req, res, next) {
    try {
        const row = await svc.getByCode(req.params.deviceCode);
        if (!row) return res.status(404).json({ success: false, message: 'No device config with that code', code: 'NOT_FOUND' });
        res.json({ success: true, data: row });
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const row = await svc.create(req.body);
        await deviceManager.reloadAll();
        res.json({ success: true, data: row });
    } catch (err) { next(err); }
}

async function update(req, res, next) {
    try {
        const row = await svc.update(parseInt(req.params.id, 10), req.body);
        await deviceManager.reloadAll();
        res.json({ success: true, data: row });
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        await svc.remove(parseInt(req.params.id, 10));
        await deviceManager.reloadAll();
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function detectMac(req, res, next) {
    try {
        res.json({ success: true, data: await svc.detectMac(req.query.ip) });
    } catch (err) { next(err); }
}

module.exports = { listAll, getByCode, create, update, remove, detectMac };
