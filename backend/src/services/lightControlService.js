'use strict';

const { getPool, sql } = require('../config/db');
const adam        = require('./Adam6052Service');
const lightEvents = require('./lightEvents');
const logger      = require('../utils/logger');

// ─── Station → ADAM DO channel map ────────────────────────────────────────────
const STATION_CHANNELS = {
  'STN-01': [0, 1, 2, 3],
  'STN-02': [4, 5, 6, 7],
};
const DEFAULT_STATION = 'STN-01';

function _channels(stationId) {
  return STATION_CHANNELS[stationId] || STATION_CHANNELS[DEFAULT_STATION];
}

// In-memory session→party mapping cache
// Map<sessionId, { [cardCode]: { channel, partyNum } }>
const _cache = new Map();

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function _emitStatus(sessionId, stationId) {
  try {
    const pool = await getPool();
    const res  = await pool.request()
      .input('sid', sql.Int,          sessionId)
      .input('sta', sql.NVarChar(50), stationId)
      .query(`
        SELECT
          ls.StatusID, ls.SessionID, ls.StationId, ls.PicklistId,
          ls.CardCode, ls.PartyId, ls.Channel, ls.ChannelName,
          ls.Status, ls.UpdatedTime,
          ISNULL(pp.TotalQty,  0) AS TotalQty,
          ISNULL(pp.PickedQty, 0) AS PickedQty,
          ISNULL(pp.TotalQty - pp.PickedQty, 0) AS RemainingQty,
          CASE
            WHEN ls.Status = 'ON'  THEN 'ACTIVE'
            WHEN ls.Status = 'OFF' AND ISNULL(pp.TotalQty - pp.PickedQty, 0) = 0
              AND ISNULL(pp.TotalQty, 0) > 0 THEN 'COMPLETED'
            ELSE 'OFF'
          END AS PartyStatus
        FROM GTP_StationLightStatus ls
        LEFT JOIN (
          SELECT SessionID, CardCode,
            SUM(RequiredQty) AS TotalQty,
            SUM(PickedQty)   AS PickedQty
          FROM GTP_PickProgress
          GROUP BY SessionID, CardCode
        ) pp ON pp.SessionID = ls.SessionID AND pp.CardCode = ls.CardCode
        WHERE ls.SessionID = @sid AND ls.StationId = @sta
        ORDER BY ls.PartyId
      `);
    lightEvents.emit('light-changed', { sessionId, stationId, lights: res.recordset });
  } catch (err) {
    logger.error('[LIGHTS] emit error:', err.message);
  }
}

async function _loadMapping(sessionId) {
  if (_cache.has(sessionId)) return _cache.get(sessionId);

  const pool = await getPool();
  const res  = await pool.request()
    .input('sid', sql.Int, sessionId)
    .query(`SELECT CardCode, Channel, PartyId FROM GTP_StationLightStatus WHERE SessionID=@sid`);

  const m = {};
  for (const r of res.recordset) m[r.CardCode] = { channel: r.Channel, partyNum: r.PartyId };
  _cache.set(sessionId, m);
  return m;
}

/**
 * Rebuild mapping for sessions that predate light tracking.
 * Reads distinct CardCodes from GTP_PickProgress ordered by first appearance,
 * inserts GTP_StationLightStatus rows, and updates the cache.
 */
async function _rebuildMapping(sessionId, cardCode) {
  try {
    const pool = await getPool();

    // Get session headerId
    const sesRes = await pool.request()
      .input('sid', sql.Int, sessionId)
      .query(`SELECT TOP 1 HeaderId FROM GTP_PicklistSessions WHERE SessionID=@sid`);
    const headerId  = sesRes.recordset[0]?.HeaderId || '';
    const stationId = DEFAULT_STATION;
    const channels  = _channels(stationId);

    // Get distinct parties in insertion order
    const partyRes = await pool.request()
      .input('sid', sql.Int, sessionId)
      .query(`SELECT DISTINCT CardCode FROM GTP_PickProgress
              WHERE SessionID=@sid ORDER BY CardCode`);
    const parties = partyRes.recordset;

    const mapping = {};
    for (let i = 0; i < Math.min(parties.length, 4); i++) {
      const cc      = parties[i].CardCode;
      const channel = channels[i];
      const partyNum = i + 1;
      mapping[cc] = { channel, partyNum };

      await pool.request()
        .input('sid', sql.Int,          sessionId)
        .input('sta', sql.NVarChar(50), stationId)
        .input('hid', sql.NVarChar(50), headerId)
        .input('cc',  sql.NVarChar(50), cc)
        .input('pn',  sql.Int,          partyNum)
        .input('ch',  sql.Int,          channel)
        .input('cn',  sql.NVarChar(10), `D${channel}`)
        .query(`
          MERGE GTP_StationLightStatus AS T
          USING (SELECT @sid AS SessionID, @cc AS CardCode) AS S
            ON  T.SessionID = S.SessionID AND T.CardCode = S.CardCode
          WHEN MATCHED THEN UPDATE SET Channel=@ch, ChannelName=@cn, UpdatedTime=GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (SessionID, StationId, PicklistId, CardCode, PartyId, Channel, ChannelName, Status)
            VALUES (@sid, @sta, @hid, @cc, @pn, @ch, @cn, 'OFF');
        `);
    }
    _cache.set(sessionId, mapping);
    logger.info(`[LIGHTS] Rebuilt mapping for session=${sessionId}: ${Object.entries(mapping).map(([cc,v]) => `${cc}→D${v.channel}`).join(', ')}`);
  } catch (err) {
    logger.error(`[LIGHTS] _rebuildMapping error: ${err.message}`);
  }
}

async function _getStationId(sessionId) {
  const pool = await getPool();
  const res  = await pool.request()
    .input('sid', sql.Int, sessionId)
    .query(`SELECT TOP 1 StationId FROM GTP_StationLightStatus WHERE SessionID=@sid`);
  return res.recordset[0]?.StationId || DEFAULT_STATION;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * activatePicklistLights(sessionId, stationId, headerId, parties)
 *
 * Called at session start.
 * - Resets ALL station channels to OFF
 * - Stores party→channel mapping in DB (all Status='OFF')
 * - Does NOT turn any light ON — lights activate on first scan via setActivePartyLight()
 */
async function activatePicklistLights(sessionId, stationId, headerId, parties) {
  const pool     = await getPool();
  const channels = _channels(stationId);
  const mapping  = {};

  logger.info(`[LIGHTS] Init session=${sessionId} station=${stationId} parties=${parties.length} — all OFF`);

  // Reset all station channels to OFF — one atomic FC15 write
  adam.writeAllOutputs(0)
    .then(()  => logger.info('[LIGHTS] All outputs reset to OFF (session start)'))
    .catch(e  => logger.error(`[LIGHTS] Reset all-OFF failed: ${e.message}`));

  // Store party→channel mapping in DB (Status='OFF' — lights activate on first scan)
  for (let i = 0; i < Math.min(parties.length, 4); i++) {
    const { cardCode } = parties[i];
    const channel      = channels[i];
    const partyNum     = i + 1;
    mapping[cardCode]  = { channel, partyNum };

    await pool.request()
      .input('sid', sql.Int,          sessionId)
      .input('sta', sql.NVarChar(50), stationId)
      .input('hid', sql.NVarChar(50), headerId)
      .input('cc',  sql.NVarChar(50), cardCode)
      .input('pn',  sql.Int,          partyNum)
      .input('ch',  sql.Int,          channel)
      .input('cn',  sql.NVarChar(10), `D${channel}`)
      .query(`
        MERGE GTP_StationLightStatus AS T
        USING (SELECT @sid AS SessionID, @cc AS CardCode) AS S
          ON  T.SessionID = S.SessionID AND T.CardCode = S.CardCode
        WHEN MATCHED THEN
          UPDATE SET Status='OFF', UpdatedTime=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (SessionID, StationId, PicklistId, CardCode, PartyId, Channel, ChannelName, Status)
          VALUES (@sid, @sta, @hid, @cc, @pn, @ch, @cn, 'OFF');
      `);
  }

  _cache.set(sessionId, mapping);
  await _emitStatus(sessionId, stationId);
}

/**
 * setActivePartyLight(sessionId, cardCode)
 *
 * Called on every item scan (when the party is still active).
 * Spotlight model — at most 2 sequential FC05 writes per scan:
 *   1. Turn OFF the previously-active channel (if different from new)
 *   2. Turn ON the new party's channel
 * Does NOT blast all 4 channels every scan.
 */
async function setActivePartyLight(sessionId, cardCode) {
  const pool    = await getPool();
  const mapping = await _loadMapping(sessionId);
  const info    = mapping[cardCode];

  if (!info) {
    // Mapping missing — this session may have started before light tracking was enabled.
    // Rebuild from GTP_PickProgress so the first scan always works.
    logger.warn(`[LIGHTS] No mapping for party=${cardCode} session=${sessionId} — rebuilding`);
    await _rebuildMapping(sessionId, cardCode);
    const rebuilt = _cache.get(sessionId);
    if (!rebuilt || !rebuilt[cardCode]) {
      logger.error(`[LIGHTS] Cannot rebuild mapping for session=${sessionId}`);
      return;
    }
    return setActivePartyLight(sessionId, cardCode);   // retry once
  }

  const stationId = await _getStationId(sessionId);

  // Find the channel currently recorded as ON in DB for this session
  const curRes = await pool.request()
    .input('sid', sql.Int, sessionId)
    .query(`SELECT TOP 1 CardCode, Channel FROM GTP_StationLightStatus
            WHERE SessionID=@sid AND Status='ON'`);
  const currentOn = curRes.recordset[0] || null;

  logger.info(`[LIGHTS] Spotlight: prevDB=D${currentOn?.Channel ?? 'none'} → target=D${info.channel} (${cardCode})`);

  // ── Step 1: Turn OFF the previously active channel if it differs ─────────
  // (Do NOT skip even if same channel — DB state may be stale vs hardware)
  if (currentOn !== null && currentOn.Channel !== info.channel) {
    try {
      await adam.writeSingleOutput(currentOn.Channel, false);
      logger.info(`[LIGHTS] D${currentOn.Channel} (prev ${currentOn.CardCode}) → OFF`);
    } catch (e) {
      logger.error(`[LIGHTS] D${currentOn.Channel} OFF failed: ${e.message}`);
    }
  }

  // ── Step 2: Always write the target channel ON regardless of DB state ─────
  // Hardware may be out of sync with DB (server restart resets ADAM to all-OFF)
  try {
    await adam.writeSingleOutput(info.channel, true);
    logger.info(`[LIGHTS] D${info.channel} Party${info.partyNum} (${cardCode}) → ON ✓`);
  } catch (e) {
    logger.error(`[LIGHTS] D${info.channel} ON FAILED: ${e.message}`);
  }

  // ── Update DB ─────────────────────────────────────────────────────────────
  await pool.request()
    .input('sid', sql.Int, sessionId)
    .query(`UPDATE GTP_StationLightStatus SET Status='OFF', UpdatedTime=GETDATE()
            WHERE SessionID=@sid`);
  await pool.request()
    .input('sid', sql.Int,          sessionId)
    .input('cc',  sql.NVarChar(50), cardCode)
    .query(`UPDATE GTP_StationLightStatus SET Status='ON', UpdatedTime=GETDATE()
            WHERE SessionID=@sid AND CardCode=@cc`);

  await _emitStatus(sessionId, stationId);
}

/**
 * handlePartyComplete(sessionId, cardCode)
 *
 * Called when ALL items in a party are done.
 * Turns OFF that party's channel. Other channels already OFF (spotlight model).
 */
async function handlePartyComplete(sessionId, cardCode) {
  const pool    = await getPool();
  const mapping = await _loadMapping(sessionId);
  const info    = mapping[cardCode];

  if (!info) {
    logger.warn(`[LIGHTS] No mapping party=${cardCode} session=${sessionId}`);
    return;
  }

  const stationId = await _getStationId(sessionId);

  adam.writeSingleOutput(info.channel, false)
    .then(()  => logger.info(`[LIGHTS] D${info.channel} Party${info.partyNum} (${cardCode}) → OFF (done)`))
    .catch(e  => logger.error(`[LIGHTS] D${info.channel} OFF failed: ${e.message}`));

  await pool.request()
    .input('sid', sql.Int,          sessionId)
    .input('cc',  sql.NVarChar(50), cardCode)
    .query(`UPDATE GTP_StationLightStatus
            SET Status='OFF', UpdatedTime=GETDATE()
            WHERE SessionID=@sid AND CardCode=@cc`);

  await _emitStatus(sessionId, stationId);
}

/**
 * resetStationLights(sessionId)
 * Called when the entire picklist is completed — all channels OFF.
 */
async function resetStationLights(sessionId) {
  const pool      = await getPool();
  const stationId = await _getStationId(sessionId);
  const channels  = _channels(stationId);

  // One atomic FC15 write — all channels OFF
  adam.writeAllOutputs(0)
    .then(()  => logger.info(`[LIGHTS] All outputs OFF (picklist done, station=${stationId})`))
    .catch(e  => logger.error(`[LIGHTS] Reset all-OFF failed: ${e.message}`));

  await pool.request()
    .input('sid', sql.Int, sessionId)
    .query(`UPDATE GTP_StationLightStatus
            SET Status='OFF', UpdatedTime=GETDATE()
            WHERE SessionID=@sid`);

  _cache.delete(sessionId);
  await _emitStatus(sessionId, stationId);
}

/**
 * getLightStatus(stationId, sessionId?)
 */
async function getLightStatus(stationId, sessionId) {
  const pool = await getPool();

  const baseQuery = `
    SELECT
      ls.StatusID, ls.SessionID, ls.StationId, ls.PicklistId,
      ls.CardCode, ls.PartyId, ls.Channel, ls.ChannelName,
      ls.Status, ls.UpdatedTime,
      ISNULL(pp.TotalQty,  0) AS TotalQty,
      ISNULL(pp.PickedQty, 0) AS PickedQty,
      ISNULL(pp.TotalQty - pp.PickedQty, 0) AS RemainingQty,
      CASE
        WHEN ls.Status = 'ON'  THEN 'ACTIVE'
        WHEN ls.Status = 'OFF' AND ISNULL(pp.TotalQty - pp.PickedQty, 0) = 0
          AND ISNULL(pp.TotalQty, 0) > 0 THEN 'COMPLETED'
        ELSE 'OFF'
      END AS PartyStatus
    FROM GTP_StationLightStatus ls
    LEFT JOIN (
      SELECT SessionID, CardCode,
        SUM(RequiredQty) AS TotalQty,
        SUM(PickedQty)   AS PickedQty
      FROM GTP_PickProgress
      GROUP BY SessionID, CardCode
    ) pp ON pp.SessionID = ls.SessionID AND pp.CardCode = ls.CardCode
  `;

  if (sessionId) {
    const res = await pool.request()
      .input('sid', sql.Int,          parseInt(sessionId))
      .input('sta', sql.NVarChar(50), stationId)
      .query(`${baseQuery} WHERE ls.SessionID=@sid AND ls.StationId=@sta ORDER BY ls.PartyId`);
    return res.recordset;
  }

  const res = await pool.request()
    .input('sta', sql.NVarChar(50), stationId)
    .query(`${baseQuery}
            WHERE ls.StationId=@sta
              AND ls.SessionID = (
                SELECT TOP 1 SessionID FROM GTP_StationLightStatus
                WHERE StationId=@sta ORDER BY StatusID DESC
              )
            ORDER BY ls.PartyId`);
  return res.recordset;
}

/**
 * resetAllLightStates()
 *
 * Call on server startup to sync DB with hardware.
 * ADAM-6052 always starts with all outputs OFF after a power cycle or TCP reconnect.
 * Any stale 'ON' rows in the DB would cause setActivePartyLight to short-circuit
 * and never write to ADAM (thinking the channel is already ON).
 */
async function resetAllLightStates() {
  try {
    const pool = await getPool();
    const res = await pool.request()
      .query(`UPDATE GTP_StationLightStatus SET Status='OFF', UpdatedTime=GETDATE()
              WHERE Status='ON'`);
    if (res.rowsAffected[0] > 0) {
      logger.info(`[LIGHTS] Startup reset: ${res.rowsAffected[0]} stale ON row(s) → OFF (DB synced with ADAM hardware)`);
    }
    _cache.clear();
  } catch (err) {
    logger.error(`[LIGHTS] resetAllLightStates error: ${err.message}`);
  }
}

module.exports = {
  activatePicklistLights,
  setActivePartyLight,
  handlePartyComplete,
  resetStationLights,
  getLightStatus,
  resetAllLightStates,
};
