const { getPool, sql } = require('../config/db');

async function getOrdersPaged({ page = 1, limit = 50, status, search, priority } = {}) {
    const pool   = await getPool();
    const offset = (page - 1) * limit;

    const result = await pool.request()
        .input('status',   sql.NVarChar(20),  status   || null)
        .input('search',   sql.NVarChar(200), search   ? `%${search}%` : null)
        .input('priority', sql.Int,           priority || null)
        .input('offset',   sql.Int,           offset)
        .input('limit',    sql.Int,           limit)
        .query(`
            SELECT
                COUNT(*) OVER() AS TotalCount,
                o.*,
                b.BinCode, b.LightColor,
                s.StationCode, s.StationName,
                op.OperatorName
            FROM GTP_Orders o
            LEFT JOIN GTP_Bins     b  ON b.BinID      = o.AssignedBinID
            LEFT JOIN GTP_Stations s  ON s.StationID  = b.StationID
            LEFT JOIN GTP_Operators op ON op.OperatorID = o.OperatorID
            WHERE (@status   IS NULL OR o.Status    = @status)
              AND (@search   IS NULL OR o.OrderNumber LIKE @search OR o.CustomerName LIKE @search)
              AND (@priority IS NULL OR o.Priority  = @priority)
            ORDER BY
                CASE o.Priority WHEN 3 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
                o.CreatedAt DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

    const records = result.recordset;
    const total   = records.length > 0 ? records[0].TotalCount : 0;
    return {
        data: records.map(({ TotalCount, ...r }) => r),
        total, page, limit,
        totalPages: Math.ceil(total / limit),
    };
}

async function getOrderById(orderId) {
    const pool = await getPool();
    const [orderRes, itemsRes] = await Promise.all([
        pool.request()
            .input('id', sql.Int, orderId)
            .query(`
                SELECT o.*, b.BinCode, b.LightColor, b.BinRow, b.BinColumn,
                       s.StationCode, s.StationName, op.OperatorName
                FROM GTP_Orders o
                LEFT JOIN GTP_Bins      b  ON b.BinID      = o.AssignedBinID
                LEFT JOIN GTP_Stations  s  ON s.StationID  = b.StationID
                LEFT JOIN GTP_Operators op ON op.OperatorID = o.OperatorID
                WHERE o.OrderID = @id
            `),
        pool.request()
            .input('id', sql.Int, orderId)
            .query('SELECT * FROM GTP_OrderItems WHERE OrderID=@id ORDER BY SortSeq, ItemID'),
    ]);
    if (!orderRes.recordset[0]) return null;
    return { ...orderRes.recordset[0], items: itemsRes.recordset };
}

async function createOrder(data) {
    const pool = await getPool();
    const t    = pool.transaction();
    await t.begin();
    try {
        const orderRes = await t.request()
            .input('num',      sql.NVarChar(50),  data.orderNumber)
            .input('custCode', sql.NVarChar(50),  data.customerCode || null)
            .input('custName', sql.NVarChar(200), data.customerName || null)
            .input('priority', sql.Int,           data.priority || 1)
            .input('notes',    sql.NVarChar(500), data.notes || null)
            .input('total',    sql.Int,           (data.items || []).length)
            .query(`
                INSERT INTO GTP_Orders (OrderNumber,CustomerCode,CustomerName,Priority,Notes,TotalItems)
                OUTPUT INSERTED.*
                VALUES (@num,@custCode,@custName,@priority,@notes,@total)
            `);
        const order = orderRes.recordset[0];

        for (let i = 0; i < (data.items || []).length; i++) {
            const item = data.items[i];
            await t.request()
                .input('oid',  sql.Int,           order.OrderID)
                .input('seq',  sql.Int,           i + 1)
                .input('code', sql.NVarChar(50),  item.itemCode)
                .input('name', sql.NVarChar(200), item.itemName)
                .input('sku',  sql.NVarChar(100), item.sku || null)
                .input('qty',  sql.Decimal(10, 2), item.requiredQty)
                .input('uom',  sql.NVarChar(20),  item.uom || 'PCS')
                .query(`
                    INSERT INTO GTP_OrderItems (OrderID,SortSeq,ItemCode,ItemName,SKU,RequiredQty,UOM)
                    VALUES (@oid,@seq,@code,@name,@sku,@qty,@uom)
                `);
        }
        await t.commit();
        return order;
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

async function updateOrderStatus(orderId, status, extra = {}) {
    const pool = await getPool();
    const now  = new Date();
    const setFragments = ['Status=@status'];
    const req  = pool.request()
        .input('id',     sql.Int,       orderId)
        .input('status', sql.NVarChar(20), status);

    if (status === 'InProgress' && !extra.skipTimestamp) {
        setFragments.push('StartedAt=@now');
        req.input('now', sql.DateTime, now);
    }
    if (status === 'Completed') {
        setFragments.push('CompletedAt=@now');
        req.input('now', sql.DateTime, now);
    }
    if (extra.binId !== undefined) {
        setFragments.push('AssignedBinID=@binId');
        req.input('binId', sql.Int, extra.binId);
    }
    if (extra.operatorId !== undefined) {
        setFragments.push('OperatorID=@opId');
        req.input('opId', sql.Int, extra.operatorId);
    }

    const result = await req.query(`
        UPDATE GTP_Orders SET ${setFragments.join(',')}
        OUTPUT INSERTED.*
        WHERE OrderID=@id
    `);
    return result.recordset[0] || null;
}

async function deleteOrder(orderId) {
    const pool = await getPool();
    await pool.request()
        .input('id', sql.Int, orderId)
        .query("UPDATE GTP_Orders SET Status='Cancelled' WHERE OrderID=@id AND Status='Pending'");
}

async function getOrderSummary() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            Status,
            COUNT(*) AS Count,
            SUM(TotalItems) AS TotalItems,
            SUM(PutItems)   AS PutItems
        FROM GTP_Orders
        GROUP BY Status
    `);
    const map = { Pending: 0, Assigned: 0, InProgress: 0, Completed: 0, Cancelled: 0 };
    result.recordset.forEach(r => { map[r.Status] = r.Count; });
    return map;
}

module.exports = { getOrdersPaged, getOrderById, createOrder, updateOrderStatus, deleteOrder, getOrderSummary };
