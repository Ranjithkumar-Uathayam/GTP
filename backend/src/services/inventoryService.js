const { getPool, sql } = require('../config/db');

async function getInventoryPaged({ page = 1, limit = 50, search, brand, lowStock } = {}) {
    const pool   = await getPool();
    const offset = (page - 1) * limit;

    const searchVal   = search   ? `%${search}%`   : null;
    const brandVal    = brand    || null;
    const lowStockVal = lowStock === 'true' || lowStock === true ? 1 : null;

    const result = await pool.request()
        .input('search',   sql.NVarChar(200), searchVal)
        .input('brand',    sql.NVarChar(100), brandVal)
        .input('lowStock', sql.Int,           lowStockVal)
        .input('offset',   sql.Int,           offset)
        .input('limit',    sql.Int,           limit)
        .query(`
            SELECT
                COUNT(*) OVER() AS TotalCount,
                *,
                (AvailableQty - ReservedQty) AS FreeQty
            FROM GTP_Inventory
            WHERE IsActive = 1
              AND (@search   IS NULL OR ItemCode LIKE @search OR ItemName LIKE @search)
              AND (@brand    IS NULL OR Brand = @brand)
              AND (@lowStock IS NULL OR (AvailableQty - ReservedQty) <= MinQty)
            ORDER BY ItemCode
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

    const records = result.recordset;
    const total   = records.length > 0 ? records[0].TotalCount : 0;
    return {
        data: records.map(({ TotalCount, ...r }) => r),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

async function getInventoryByCode(itemCode) {
    const pool = await getPool();
    const result = await pool.request()
        .input('code', sql.NVarChar(50), itemCode)
        .query('SELECT *, (AvailableQty - ReservedQty) AS FreeQty FROM GTP_Inventory WHERE ItemCode=@code');
    return result.recordset[0] || null;
}

async function adjustStock(itemCode, delta, type = 'manual') {
    const pool = await getPool();
    const result = await pool.request()
        .input('code',  sql.NVarChar(50),  itemCode)
        .input('delta', sql.Decimal(10, 2), delta)
        .query(`
            UPDATE GTP_Inventory
            SET AvailableQty = AvailableQty + @delta, LastUpdated = GETDATE()
            OUTPUT INSERTED.*
            WHERE ItemCode = @code
        `);
    return result.recordset[0] || null;
}

async function reserveStock(itemCode, qty) {
    const pool = await getPool();
    const result = await pool.request()
        .input('code', sql.NVarChar(50),  itemCode)
        .input('qty',  sql.Decimal(10, 2), qty)
        .query(`
            UPDATE GTP_Inventory
            SET ReservedQty = ReservedQty + @qty, LastUpdated = GETDATE()
            OUTPUT INSERTED.*
            WHERE ItemCode = @code
              AND (AvailableQty - ReservedQty) >= @qty
        `);
    return result.recordset[0] || null;
}

async function releaseReservation(itemCode, qty) {
    const pool = await getPool();
    await pool.request()
        .input('code', sql.NVarChar(50),  itemCode)
        .input('qty',  sql.Decimal(10, 2), qty)
        .query(`
            UPDATE GTP_Inventory
            SET ReservedQty = CASE WHEN ReservedQty >= @qty THEN ReservedQty - @qty ELSE 0 END,
                LastUpdated = GETDATE()
            WHERE ItemCode = @code
        `);
}

async function upsertInventory(items) {
    const pool = await getPool();
    for (const item of items) {
        await pool.request()
            .input('code',  sql.NVarChar(50),  item.ItemCode)
            .input('name',  sql.NVarChar(200), item.ItemName)
            .input('brand', sql.NVarChar(100), item.Brand || null)
            .input('cat',   sql.NVarChar(100), item.Category || null)
            .input('uom',   sql.NVarChar(20),  item.UOM || 'PCS')
            .input('qty',   sql.Decimal(10, 2), item.Qty || 0)
            .query(`
                MERGE GTP_Inventory AS tgt
                USING (SELECT @code AS ItemCode) AS src ON tgt.ItemCode = src.ItemCode
                WHEN MATCHED THEN
                    UPDATE SET ItemName=@name, Brand=@brand, Category=@cat,
                               UOM=@uom, AvailableQty=@qty, LastUpdated=GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (ItemCode, ItemName, Brand, Category, UOM, AvailableQty)
                    VALUES (@code, @name, @brand, @cat, @uom, @qty);
            `);
    }
}

module.exports = { getInventoryPaged, getInventoryByCode, adjustStock, reserveStock, releaseReservation, upsertInventory };
