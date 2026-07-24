'use strict';

const EventEmitter = require('events');
const AdamDevice   = require('./Adam6052Service');
const configSvc    = require('./adamDeviceConfigService');
const { getMacForIp, normalizeMac } = require('../utils/macAddress');
const logger       = require('../utils/logger');

const MAC_RECHECK_MS = 5 * 60 * 1000;

// Legacy singleton — powers the existing /api/adam/* debug dashboard when no
// ?device= is specified, env-configured. Unaffected by per-device config.
const legacyDevice = new AdamDevice();

// Map<DeviceCode, { device, config, macStatus: 'ok'|'mismatch'|'unknown' }>
const _devices = new Map();
let _macTimer = null;

// Re-emits { deviceCode, ...statusPayload } for every configured device so the
// socket layer can forward device-tagged status pushes without knowing about
// individual Adam6052Service instances (which get torn down/rebuilt on reload).
const statusBus = new EventEmitter();

function getLegacyDevice() {
    return legacyDevice;
}

async function _validateMac(entry) {
    const { config } = entry;
    if (!config.MacAddress) {
        entry.macStatus = 'unknown';
        return;
    }
    const actual = await getMacForIp(config.IpAddress);
    if (!actual) {
        entry.macStatus = 'unknown';
        logger.warn(`[ADAM-MGR] Could not resolve MAC for ${config.IpAddress} (device ${config.DeviceCode}) via ARP`);
        return;
    }
    const expected = normalizeMac(config.MacAddress);
    entry.macStatus = actual === expected ? 'ok' : 'mismatch';
    if (entry.macStatus === 'mismatch') {
        logger.error(`[ADAM-MGR] MAC MISMATCH device=${config.DeviceCode} ip=${config.IpAddress} expected=${expected} actual=${actual}`);
    }
}

async function _buildEntry(config) {
    const device = new AdamDevice({ ip: config.IpAddress, port: config.Port, unitId: config.UnitId });
    const entry  = { device, config, macStatus: 'unknown' };
    device.on('status', (payload) => statusBus.emit('status', { deviceCode: config.DeviceCode, ...payload }));
    await device.start();
    await _validateMac(entry);
    return entry;
}

/** Tears down and rebuilds every configured device from the DB. Called at startup
 *  and after any create/update/delete through the config screen. */
async function reloadAll() {
    for (const entry of _devices.values()) {
        try { entry.device.destroy(); } catch (_) {}
    }
    _devices.clear();

    const rows = await configSvc.listActive();
    for (const row of rows) {
        try {
            const entry = await _buildEntry(row);
            _devices.set(row.DeviceCode, entry);
            logger.info(`[ADAM-MGR] Device ready — code=${row.DeviceCode} ip=${row.IpAddress} channels=${row.OutputStartChannel}-${row.OutputEndChannel} mac=${entry.macStatus}`);
        } catch (err) {
            logger.error(`[ADAM-MGR] Failed to init device for code=${row.DeviceCode}: ${err.message}`);
        }
    }
}

/** Called once at server startup, after the DB pool is up. */
async function init() {
    await reloadAll();

    if (!_macTimer) {
        _macTimer = setInterval(() => {
            for (const entry of _devices.values()) {
                _validateMac(entry).catch(e => logger.error(`[ADAM-MGR] MAC recheck error: ${e.message}`));
            }
        }, MAC_RECHECK_MS);
    }
}

function getDevice(deviceCode) {
    return _devices.get(deviceCode) || null;
}

function listDeviceCodes() {
    return [..._devices.keys()];
}

function getChannels(deviceCode) {
    const entry = _devices.get(deviceCode);
    if (!entry) return null;
    const { OutputStartChannel: start, OutputEndChannel: end } = entry.config;
    const channels = [];
    for (let c = start; c <= end; c++) channels.push(c);
    return channels;
}

/** Returns { device, channels } for a device code, or throws a typed, user-facing error. */
function assertUsable(deviceCode) {
    const entry = _devices.get(deviceCode);
    if (!entry) {
        throw Object.assign(
            new Error(`No ADAM device configured with code "${deviceCode}"`),
            { status: 400, code: 'ADAM_CONFIG_MISSING' }
        );
    }
    if (entry.macStatus === 'mismatch') {
        throw Object.assign(
            new Error(`ADAM device MAC address mismatch for "${deviceCode}" — communication blocked`),
            { status: 409, code: 'ADAM_MAC_MISMATCH' }
        );
    }
    return { device: entry.device, channels: getChannels(deviceCode) };
}

module.exports = {
    init,
    reloadAll,
    getDevice,
    listDeviceCodes,
    getChannels,
    assertUsable,
    getLegacyDevice,
    statusBus,
};
