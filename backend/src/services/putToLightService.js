const { getPool, sql }  = require('../config/db');
const stationSvc        = require('./stationService');
const orderSvc          = require('./orderService');
const inventorySvc      = require('./inventoryService');
const ws                = require('./websocketService');

// ── Log an event to audit trail ───────────────────────────────
async function logEvent(pool, { orderId, binId, itemCode, quantity, eventType, operatorId, notes }) {
    await pool.request()
        .input('oid',  sql.Int,           orderId   || null)
        .input('bid',  sql.Int,           binId     || null)
        .input('code', sql.NVarChar(50),  itemCode  || null)
        .input('qty',  sql.Decimal(10, 2), quantity || null)
        .input('type', sql.NVarChar(30),  eventType)
        .input('opid', sql.Int,           operatorId || null)
        .input('note', sql.NVarChar(500), notes || null)
        .query(`
            INSERT INTO GTP_PTLEvents (OrderID,BinID,ItemCode,Quantity,EventType,OperatorID,Notes)
            VALUES (@oid,@bid,@code,@qty,@type,@opid,@note)
        `);
}

// ── Assign order → bin and start the session ──────────────────
async function startOrder(orderId, operatorId, stationId) {
    const pool = await getPool();

    const order = await orderSvc.getOrderById(orderId);
    if (!order)                      throw Object.assign(new Error('Order not found'), { status: 404 });
    if (order.Status !== 'Pending')  throw Object.assign(new Error(`Order is ${order.Status}`), { status: 409 });

    // Find a free bin on the requested (or any) station
    const targetStation = stationId || null;
    let bin = null;
    if (targetStation) {
        bin = await stationSvc.getFreeBin(targetStation);
    } else {
        const stations = await stationSvc.getAllStations();
        for (const st of stations) {
            bin = await stationSvc.getFreeBin(st.StationID);
            if (bin) break;
        }
    }
    if (!bin) throw Object.assign(new Error('No free bin available'), { status: 503 });

    // Assign bin → order
    await pool.request()
        .input('binId',  sql.Int, bin.BinID)
        .input('orderId', sql.Int, orderId)
        .query('UPDATE GTP_Bins SET CurrentOrderID=@orderId WHERE BinID=@binId');

    // Advance order status
    const updated = await orderSvc.updateOrderStatus(orderId, 'InProgress', {
        binId: bin.BinID,
        operatorId,
    });

    // Reserve inventory for each item
    for (const item of order.items) {
        await inventorySvc.reserveStock(item.ItemCode, item.RequiredQty).catch(() => {});
    }

    await logEvent(pool, {
        orderId, binId: bin.BinID,
        eventType: 'OrderStarted', operatorId,
        notes: `Bin ${bin.BinCode} assigned`,
    });

    const result = { order: updated, bin, items: order.items };

    ws.binActivated({ ...bin, orderId, orderNumber: order.OrderNumber, priority: order.Priority });
    ws.orderStarted(result);

    return result;
}

// ── Confirm an item has been placed into the bin ───────────────
async function confirmItem(orderId, itemId, qty, operatorId) {
    const pool  = await getPool();

    const orderRes = await pool.request()
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_Orders WHERE OrderID=@oid');
    const order = orderRes.recordset[0];
    if (!order)                      throw Object.assign(new Error('Order not found'),   { status: 404 });
    if (order.Status !== 'InProgress') throw Object.assign(new Error('Order not active'), { status: 409 });

    const itemRes = await pool.request()
        .input('iid', sql.Int, itemId)
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_OrderItems WHERE ItemID=@iid AND OrderID=@oid');
    const item = itemRes.recordset[0];
    if (!item) throw Object.assign(new Error('Item not found'), { status: 404 });

    const putQty   = qty || item.RequiredQty;
    const newTotal = Math.min(item.PutQty + putQty, item.RequiredQty);
    const itemDone = newTotal >= item.RequiredQty;

    await pool.request()
        .input('qty',    sql.Decimal(10, 2), newTotal)
        .input('status', sql.NVarChar(20),   itemDone ? 'Completed' : 'InProgress')
        .input('iid',    sql.Int,            itemId)
        .query(`
            UPDATE GTP_OrderItems
            SET PutQty=@qty, Status=@status,
                CompletedAt=CASE WHEN @status='Completed' THEN GETDATE() ELSE NULL END
            WHERE ItemID=@iid
        `);

    // Increment order PutItems counter when an item is finished
    let newPutItems = order.PutItems;
    if (itemDone && item.Status !== 'Completed') {
        const counter = await pool.request()
            .input('oid', sql.Int, orderId)
            .query(`
                UPDATE GTP_Orders SET PutItems = PutItems + 1
                OUTPUT INSERTED.PutItems, INSERTED.TotalItems
                WHERE OrderID=@oid
            `);
        newPutItems = counter.recordset[0].PutItems;
    }

    await inventorySvc.adjustStock(item.ItemCode, -putQty).catch(() => {});
    await logEvent(pool, {
        orderId,
        binId:     order.AssignedBinID,
        itemCode:  item.ItemCode,
        quantity:  putQty,
        eventType: 'ItemConfirmed',
        operatorId,
    });

    ws.itemConfirmed({ orderId, itemId, itemCode: item.ItemCode, putQty, itemDone, newPutItems });

    // Auto-complete when all items done
    const allDone = newPutItems >= order.TotalItems;
    if (allDone) {
        await completeOrder(orderId, operatorId, pool);
    }

    return { item: { ...item, PutQty: newTotal }, allDone };
}

// ── Complete (close) the order and free the bin ───────────────
async function completeOrder(orderId, operatorId, existingPool) {
    const pool = existingPool || (await getPool());

    const orderRes = await pool.request()
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_Orders WHERE OrderID=@oid');
    const order = orderRes.recordset[0];
    if (!order) return;

    // Free the bin
    if (order.AssignedBinID) {
        await pool.request()
            .input('bid', sql.Int, order.AssignedBinID)
            .query('UPDATE GTP_Bins SET CurrentOrderID=NULL WHERE BinID=@bid');
    }

    await orderSvc.updateOrderStatus(orderId, 'Completed');

    // Release remaining reservations
    const items = await pool.request()
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_OrderItems WHERE OrderID=@oid');
    for (const item of items.recordset) {
        const remaining = item.RequiredQty - item.PutQty;
        if (remaining > 0) {
            await inventorySvc.releaseReservation(item.ItemCode, remaining).catch(() => {});
        }
    }

    await logEvent(pool, {
        orderId, binId: order.AssignedBinID,
        eventType: 'OrderCompleted', operatorId,
    });

    ws.binDeactivated({ BinID: order.AssignedBinID });
    ws.orderCompleted({ orderId, orderNumber: order.OrderNumber });
}

// ── Cancel/abandon an active or pending order ─────────────────
async function cancelOrder(orderId, operatorId) {
    const pool = await getPool();

    const orderRes = await pool.request()
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_Orders WHERE OrderID=@oid');
    const order = orderRes.recordset[0];
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

    if (!['Pending','Assigned','InProgress'].includes(order.Status)) {
        throw Object.assign(new Error('Cannot cancel a completed order'), { status: 409 });
    }

    if (order.AssignedBinID) {
        await pool.request()
            .input('bid', sql.Int, order.AssignedBinID)
            .query('UPDATE GTP_Bins SET CurrentOrderID=NULL WHERE BinID=@bid');
    }

    await orderSvc.updateOrderStatus(orderId, 'Cancelled');

    const items = await pool.request()
        .input('oid', sql.Int, orderId)
        .query('SELECT * FROM GTP_OrderItems WHERE OrderID=@oid');
    for (const item of items.recordset) {
        if (item.ReservedQty > 0) {
            await inventorySvc.releaseReservation(item.ItemCode, item.RequiredQty).catch(() => {});
        }
    }

    await logEvent(pool, {
        orderId, binId: order.AssignedBinID,
        eventType: 'OrderCancelled', operatorId,
    });

    ws.binDeactivated({ BinID: order.AssignedBinID });
    ws.orderCancelled({ orderId, orderNumber: order.OrderNumber });
}

// ── Process a QR-code scan: validate + auto-confirm ───────────
async function scanQr(orderNumber, itemCode, qty, operatorId) {
    const pool = await getPool();

    const orderRes = await pool.request()
        .input('num', sql.NVarChar(50), orderNumber)
        .query('SELECT * FROM GTP_Orders WHERE OrderNumber = @num');
    const order = orderRes.recordset[0];

    if (!order)
        throw Object.assign(new Error(`Order "${orderNumber}" not found`),
            { status: 404, code: 'ORDER_NOT_FOUND' });
    if (order.Status !== 'InProgress')
        throw Object.assign(new Error(`Order is not active (${order.Status})`),
            { status: 409, code: 'ORDER_NOT_ACTIVE' });

    const itemRes = await pool.request()
        .input('code', sql.NVarChar(50), itemCode)
        .input('oid',  sql.Int,          order.OrderID)
        .query('SELECT * FROM GTP_OrderItems WHERE ItemCode=@code AND OrderID=@oid');
    const item = itemRes.recordset[0];

    if (!item)
        throw Object.assign(new Error(`Item "${itemCode}" not in order`),
            { status: 404, code: 'ITEM_NOT_IN_ORDER' });
    if (item.Status === 'Completed')
        throw Object.assign(new Error(`Item "${itemCode}" already completed`),
            { status: 409, code: 'ITEM_ALREADY_DONE' });

    const remaining = item.RequiredQty - item.PutQty;
    const putQty    = (qty > 0 && qty <= remaining) ? qty : remaining;

    const result = await confirmItem(order.OrderID, item.ItemID, putQty, operatorId);

    return {
        orderId:     order.OrderID,
        orderNumber: order.OrderNumber,
        itemId:      item.ItemID,
        itemCode:    item.ItemCode,
        itemName:    item.ItemName,
        scannedQty:  putQty,
        ...result,
    };
}

// ── Get active sessions across all stations ───────────────────
async function getActiveSessions() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            o.OrderID, o.OrderNumber, o.CustomerName, o.Priority,
            o.Status, o.TotalItems, o.PutItems, o.StartedAt,
            b.BinID, b.BinCode, b.BinRow, b.BinColumn, b.LightColor,
            s.StationID, s.StationCode, s.StationName,
            op.OperatorName
        FROM GTP_Orders o
        JOIN GTP_Bins      b  ON b.BinID      = o.AssignedBinID
        JOIN GTP_Stations  s  ON s.StationID  = b.StationID
        LEFT JOIN GTP_Operators op ON op.OperatorID = o.OperatorID
        WHERE o.Status IN ('Assigned','InProgress')
        ORDER BY o.Priority DESC, o.StartedAt
    `);
    return result.recordset;
}

async function getEventLog(orderId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('oid', sql.Int, orderId)
        .query(`
            SELECT e.*, op.OperatorName
            FROM GTP_PTLEvents e
            LEFT JOIN GTP_Operators op ON op.OperatorID = e.OperatorID
            WHERE e.OrderID = @oid
            ORDER BY e.EventTime
        `);
    return result.recordset;
}

module.exports = { startOrder, confirmItem, completeOrder, cancelOrder, getActiveSessions, getEventLog };
