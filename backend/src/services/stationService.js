const { getPool, sql } = require('../config/db');

async function getAllStations() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT s.*,
            COUNT(b.BinID)                                            AS TotalBins,
            SUM(CASE WHEN b.CurrentOrderID IS NOT NULL THEN 1 ELSE 0 END) AS ActiveBins,
            SUM(CASE WHEN b.CurrentOrderID IS NULL AND b.IsActive=1 THEN 1 ELSE 0 END) AS FreeBins
        FROM GTP_Stations s
        LEFT JOIN GTP_Bins b ON b.StationID = s.StationID
        GROUP BY s.StationID, s.StationCode, s.StationName, s.Description, s.IsActive, s.CreatedAt
        ORDER BY s.StationCode
    `);
    return result.recordset;
}

async function getStationWithBins(stationId) {
    const pool = await getPool();
    const [stRes, binRes] = await Promise.all([
        pool.request()
            .input('id', sql.Int, stationId)
            .query('SELECT * FROM GTP_Stations WHERE StationID=@id'),
        pool.request()
            .input('id', sql.Int, stationId)
            .query(`
                SELECT b.*,
                    o.OrderNumber, o.CustomerName, o.Priority, o.Status AS OrderStatus,
                    o.TotalItems, o.PutItems
                FROM GTP_Bins b
                LEFT JOIN GTP_Orders o ON o.OrderID = b.CurrentOrderID
                WHERE b.StationID = @id
                ORDER BY b.BinRow, b.BinColumn
            `),
    ]);
    if (!stRes.recordset[0]) return null;
    return { ...stRes.recordset[0], bins: binRes.recordset };
}

async function createStation(data) {
    const pool = await getPool();
    const result = await pool.request()
        .input('code', sql.NVarChar(50),  data.stationCode)
        .input('name', sql.NVarChar(100), data.stationName)
        .input('desc', sql.NVarChar(255), data.description || null)
        .query(`
            INSERT INTO GTP_Stations (StationCode, StationName, Description)
            OUTPUT INSERTED.*
            VALUES (@code, @name, @desc)
        `);
    return result.recordset[0];
}

async function addBin(stationId, data) {
    const pool = await getPool();
    const result = await pool.request()
        .input('stationId', sql.Int,       stationId)
        .input('binCode',   sql.NVarChar(50),  data.binCode)
        .input('row',       sql.Int,       data.binRow   || 1)
        .input('col',       sql.Int,       data.binColumn || 1)
        .input('color',     sql.NVarChar(20), data.lightColor || 'green')
        .query(`
            INSERT INTO GTP_Bins (StationID, BinCode, BinRow, BinColumn, LightColor)
            OUTPUT INSERTED.*
            VALUES (@stationId, @binCode, @row, @col, @color)
        `);
    return result.recordset[0];
}

async function getFreeBin(stationId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('stationId', sql.Int, stationId)
        .query(`
            SELECT TOP 1 * FROM GTP_Bins
            WHERE StationID=@stationId AND CurrentOrderID IS NULL AND IsActive=1
            ORDER BY BinRow, BinColumn
        `);
    return result.recordset[0] || null;
}

module.exports = { getAllStations, getStationWithBins, createStation, addBin, getFreeBin };
