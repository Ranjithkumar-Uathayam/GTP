const { getPool, sql } = require('../config/db');
const ws       = require('./websocketService');
const delivery = require('./deliveryService');

// ── Parse barcode: ITEMCODE|ST|IDVALUE|GROUP|UNIQUENUM|QTY ────
function parseBarcode(raw) {
    const parts = raw.trim().split('|');
    if (parts.length < 1) return null;
    return {
        itemCode:    parts[0] || null,
        scanType:    parts[1] || null,
        idValue:     parts[2] || null,
        itemGroup:   parts[3] || null,
        uniqueNumber:parts[4] || null,
        qty:         parts[5] ? parseFloat(parts[5]) : 1,
    };
}

// ── Load picklist data from WMS + BBLive ──────────────────────
async function loadPicklistData(headerId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('hid', sql.NVarChar(50), headerId)
        .query(`
            SELECT
                T0.HeaderId,
                T0.DocEntry,
                T1.CardCode,
                T1.CardName,
                T1.U_Arcode,
                T1.U_Brand,
                T0.ProductCode,
                T0.ProductName,
                ISNULL(T0.OrderQty, 0) AS OrderQty,
                ISNULL(T0.ReqQty,   0) AS ReqQty,
                T2.U_SalPriceCode,
                D.CountofOrder
            FROM (
                SELECT DISTINCT
                    HeaderId, DocEntry, ProductCode, ProductName, OrderQty, ReqQty
                FROM WMS.dbo.Tran_TransDetails
                WHERE HeaderId = @hid
            ) AS T0
            INNER JOIN BBLive.dbo.ORDR AS T1 ON T0.DocEntry = T1.DocEntry
            INNER JOIN (
                SELECT CardCode, MAX(U_SalPriceCode) AS U_SalPriceCode
                FROM BBLive.dbo.OCRD
                GROUP BY CardCode
            ) AS T2 ON T2.CardCode = T1.CardCode
            CROSS JOIN (
                SELECT COUNT(DISTINCT TD.DocEntry) AS CountofOrder
                FROM WMS.dbo.Tran_TransDetails TD
                WHERE TD.HeaderId = @hid
            ) AS D
            ORDER BY T0.DocEntry, T0.ProductCode
        `);
    return result.recordset;
}

// ── Start a new picking session ────────────────────────────────
async function startSession(headerId, operatorId) {
    const pool = await getPool();

    // Deactivate any existing InProgress session for this picklist
    await pool.request()
        .input('hid', sql.NVarChar(50), headerId)
        .query(`UPDATE GTP_PicklistSessions SET Status='Abandoned'
                WHERE HeaderId=@hid AND Status='InProgress'`);

    const rows = await loadPicklistData(headerId);
    if (!rows.length) throw Object.assign(
        new Error(`Picklist "${headerId}" not found or has no items`),
        { status: 404, code: 'PICKLIST_NOT_FOUND' }
    );

    // Create session
    const sesRes = await pool.request()
        .input('hid',  sql.NVarChar(50), headerId)
        .input('opid', sql.Int,          operatorId || null)
        .query(`INSERT INTO GTP_PicklistSessions (HeaderId, OperatorID)
                OUTPUT INSERTED.SessionID
                VALUES (@hid, @opid)`);
    const sessionId = sesRes.recordset[0].SessionID;

    // Seed GTP_PickProgress — one row per CardCode + ProductCode
    const seen = new Set();
    for (const r of rows) {
        const key = `${r.CardCode}|${r.ProductCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await pool.request()
            .input('sid',  sql.Int,           sessionId)
            .input('hid',  sql.NVarChar(50),  headerId)
            .input('cc',   sql.NVarChar(50),  r.CardCode)
            .input('ic',   sql.NVarChar(50),  r.ProductCode)
            .input('rqty', sql.Decimal(10,2), r.ReqQty)
            .query(`INSERT INTO GTP_PickProgress
                        (SessionID, HeaderId, CardCode, ItemCode, RequiredQty)
                    VALUES (@sid, @hid, @cc, @ic, @rqty)`);
    }

    ws.broadcast('PICKLIST_STARTED', { sessionId, headerId });
    return getSession(sessionId);
}

// ── Get full session state ─────────────────────────────────────
async function getSession(sessionId) {
    const pool = await getPool();

    const sesRes = await pool.request()
        .input('sid', sql.Int, sessionId)
        .query('SELECT * FROM GTP_PicklistSessions WHERE SessionID=@sid');
    const session = sesRes.recordset[0];
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

    const rawRows = await loadPicklistData(session.HeaderId);
    if (!rawRows.length) throw Object.assign(
        new Error(`Picklist "${session.HeaderId}" data unavailable`), { status: 404 }
    );
    const countofOrder = rawRows[0].CountofOrder;

    const progRes = await pool.request()
        .input('sid', sql.Int, sessionId)
        .query('SELECT * FROM GTP_PickProgress WHERE SessionID=@sid');
    const progMap = {};
    for (const p of progRes.recordset) progMap[`${p.CardCode}|${p.ItemCode}`] = p;

    const scanLogRes = await pool.request()
        .input('sid', sql.Int, sessionId)
        .query(`SELECT CardCode, ItemCode, UniqueNumber, ScannedQty
                FROM GTP_ScanLog WHERE SessionID=@sid ORDER BY ScanID`);
    const scanPartsMap = {};
    for (const s of scanLogRes.recordset) {
        const key = `${s.CardCode}|${s.ItemCode}`;
        if (!scanPartsMap[key]) scanPartsMap[key] = [];
        scanPartsMap[key].push({ uniqueNumber: s.UniqueNumber, qty: Number(s.ScannedQty) });
    }

    // Group by CardCode (party), DocEntries tracked for orderCount
    const partyMap = {};
    for (const r of rawRows) {
        if (!partyMap[r.CardCode]) {
            partyMap[r.CardCode] = {
                cardCode:     r.CardCode,
                cardName:     r.CardName,
                uArcode:      r.U_Arcode      || '',
                uBrand:       r.U_Brand       || '',
                uSalPriceCode:r.U_SalPriceCode || '',
                docEntries:   new Set(),
                items:        [],
            };
        }
        partyMap[r.CardCode].docEntries.add(r.DocEntry);
        const prog      = progMap[`${r.CardCode}|${r.ProductCode}`] || {};
        const pickedQty = prog.PickedQty != null ? Number(prog.PickedQty) : 0;
        partyMap[r.CardCode].items.push({
            itemCode:     r.ProductCode,
            itemName:     r.ProductName,
            docEntry:     r.DocEntry,
            orderQty:     Number(r.OrderQty),
            requiredQty:  Number(r.ReqQty),
            pickedQty,
            uSalPriceCode:r.U_SalPriceCode || '',
            status:       prog.Status || 'Pending',
            scannedParts: scanPartsMap[`${r.CardCode}|${r.ProductCode}`] || [],
        });
    }

    const parties = Object.values(partyMap).map(p => {
        const items       = p.items;
        const totalReq    = items.reduce((s, i) => s + i.requiredQty, 0);
        const totalPicked = items.reduce((s, i) => s + i.pickedQty,  0);
        const allDone     = items.every(i => i.status === 'Completed');
        const anyActive   = items.some(i  => i.status === 'InProgress');
        return {
            cardCode:         p.cardCode,
            cardName:         p.cardName,
            uArcode:          p.uArcode,
            uBrand:           p.uBrand,
            uSalPriceCode:    p.uSalPriceCode,
            orderCount:       p.docEntries.size,
            totalRequiredQty: totalReq,
            totalPickedQty:   totalPicked,
            status:           allDone ? 'completed' : anyActive ? 'active' : 'pending',
            items,
        };
    });

    const completedParties = parties.filter(p => p.status === 'completed').length;

    return {
        sessionId,
        headerId:        session.HeaderId,
        countofOrder,
        status:          session.Status,
        startedAt:       session.StartedAt,
        parties,
        totalParties:    parties.length,
        completedParties,
    };
}

// ── Process a scan ─────────────────────────────────────────────
async function processScan(sessionId, barcode, cardCode) {
    const pool = await getPool();

    const parsed = parseBarcode(barcode);
    if (!parsed?.itemCode) throw Object.assign(
        new Error('Invalid barcode format'), { status: 400, code: 'INVALID_BARCODE' }
    );

    const sesRes = await pool.request()
        .input('sid', sql.Int, sessionId)
        .query('SELECT * FROM GTP_PicklistSessions WHERE SessionID=@sid');
    const session = sesRes.recordset[0];
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
    if (session.Status !== 'InProgress') throw Object.assign(
        new Error('Picklist already completed'), { status: 409, code: 'PICKLIST_DONE' }
    );

    // Duplicate scan prevention (same ItemCode + UniqueNumber in this session)
    if (parsed.uniqueNumber) {
        const dupRes = await pool.request()
            .input('sid',  sql.Int,          sessionId)
            .input('ic',   sql.NVarChar(50), parsed.itemCode)
            .input('unum', sql.NVarChar(50), parsed.uniqueNumber)
            .query(`SELECT ScanID FROM GTP_ScanLog
                    WHERE SessionID=@sid AND ItemCode=@ic AND UniqueNumber=@unum`);
        if (dupRes.recordset.length) throw Object.assign(
            new Error(`Uniqueno ${parsed.uniqueNumber} already scanned for ${parsed.itemCode}`),
            { status: 409, code: 'DUPLICATE_SCAN' }
        );
    }

    // Validate item in picklist for this party
    const progRes = await pool.request()
        .input('sid', sql.Int,          sessionId)
        .input('cc',  sql.NVarChar(50), cardCode)
        .input('ic',  sql.NVarChar(50), parsed.itemCode)
        .query(`SELECT * FROM GTP_PickProgress
                WHERE SessionID=@sid AND CardCode=@cc AND ItemCode=@ic`);
    const prog = progRes.recordset[0];
    if (!prog) throw Object.assign(
        new Error(`Item "${parsed.itemCode}" not in picklist for this party`),
        { status: 404, code: 'ITEM_NOT_IN_PICKLIST' }
    );
    if (prog.Status === 'Completed') throw Object.assign(
        new Error(`Item "${parsed.itemCode}" already completed`),
        { status: 409, code: 'ITEM_ALREADY_DONE' }
    );

    // Cap qty to remaining
    const remaining = prog.RequiredQty - prog.PickedQty;
    const scanQty   = Math.min(parsed.qty, remaining);
    const newPicked = prog.PickedQty + scanQty;
    const itemDone  = newPicked >= prog.RequiredQty;

    // Update progress
    await pool.request()
        .input('qty',  sql.Decimal(10,2), newPicked)
        .input('st',   sql.NVarChar(20),  itemDone ? 'Completed' : 'InProgress')
        .input('sid',  sql.Int,           sessionId)
        .input('cc',   sql.NVarChar(50),  cardCode)
        .input('ic',   sql.NVarChar(50),  parsed.itemCode)
        .query(`UPDATE GTP_PickProgress
                SET PickedQty=@qty, Status=@st, UpdatedAt=GETDATE()
                WHERE SessionID=@sid AND CardCode=@cc AND ItemCode=@ic`);

    // Log scan
    await pool.request()
        .input('sid',  sql.Int,           sessionId)
        .input('hid',  sql.NVarChar(50),  session.HeaderId)
        .input('cc',   sql.NVarChar(50),  cardCode)
        .input('ic',   sql.NVarChar(50),  parsed.itemCode)
        .input('st',   sql.NVarChar(10),  parsed.scanType)
        .input('idv',  sql.NVarChar(100), parsed.idValue)
        .input('grp',  sql.NVarChar(50),  parsed.itemGroup)
        .input('unum', sql.NVarChar(50),  parsed.uniqueNumber)
        .input('qty',  sql.Decimal(10,2), scanQty)
        .query(`INSERT INTO GTP_ScanLog
                    (SessionID, HeaderId, CardCode, ItemCode, ScanType,
                     IDValue, ItemGroup, UniqueNumber, ScannedQty)
                VALUES (@sid, @hid, @cc, @ic, @st, @idv, @grp, @unum, @qty)`);

    // Check party completion
    const partyProgRes = await pool.request()
        .input('sid', sql.Int,          sessionId)
        .input('cc',  sql.NVarChar(50), cardCode)
        .query(`SELECT Status FROM GTP_PickProgress
                WHERE SessionID=@sid AND CardCode=@cc`);
    const partyDone = partyProgRes.recordset.every(r => r.Status === 'Completed');

    // Check picklist completion
    const allProgRes = await pool.request()
        .input('sid', sql.Int, sessionId)
        .query(`SELECT Status FROM GTP_PickProgress WHERE SessionID=@sid`);
    const picklistDone = allProgRes.recordset.every(r => r.Status === 'Completed');

    if (picklistDone) {
        await pool.request()
            .input('sid', sql.Int, sessionId)
            .query(`UPDATE GTP_PicklistSessions
                    SET Status='Completed', CompletedAt=GETDATE()
                    WHERE SessionID=@sid`);
        ws.broadcast('PICKLIST_COMPLETED', { sessionId, headerId: session.HeaderId });
        // Last party also completed — trigger SAP delivery (fire-and-forget)
        delivery.triggerPartyDelivery(sessionId, cardCode)
            .catch(err => console.error('SAP delivery trigger error:', err.message));
    } else if (partyDone) {
        ws.broadcast('PARTY_COMPLETED', { sessionId, cardCode });
        // Party completed — trigger SAP delivery (fire-and-forget)
        delivery.triggerPartyDelivery(sessionId, cardCode)
            .catch(err => console.error('SAP delivery trigger error:', err.message));
    }

    ws.broadcast('ITEM_PICKED', {
        sessionId, cardCode,
        itemCode: parsed.itemCode,
        scannedQty: scanQty,
        newPickedQty: newPicked,
        itemCompleted: itemDone,
    });

    // Find next pending item for this party
    const nextItemRes = await pool.request()
        .input('sid', sql.Int,          sessionId)
        .input('cc',  sql.NVarChar(50), cardCode)
        .query(`SELECT TOP 1 ItemCode FROM GTP_PickProgress
                WHERE SessionID=@sid AND CardCode=@cc AND Status<>'Completed'
                ORDER BY ItemCode`);
    const nextItemCode = nextItemRes.recordset[0]?.ItemCode || null;

    return {
        itemCode:         parsed.itemCode,
        scannedQty:       scanQty,
        newPickedQty:     newPicked,
        requiredQty:      prog.RequiredQty,
        itemCompleted:    itemDone,
        partyCompleted:   partyDone,
        picklistCompleted:picklistDone,
        nextItemCode,
    };
}

// ── Resume an existing session ─────────────────────────────────
async function resumeSession(headerId) {
    const pool = await getPool();
    const res = await pool.request()
        .input('hid', sql.NVarChar(50), headerId)
        .query(`SELECT TOP 1 * FROM GTP_PicklistSessions
                WHERE HeaderId=@hid AND Status='InProgress'
                ORDER BY StartedAt DESC`);
    return res.recordset[0] || null;
}

module.exports = { startSession, getSession, processScan, resumeSession, loadPicklistData };
