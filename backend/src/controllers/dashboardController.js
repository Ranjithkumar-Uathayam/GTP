const { getPool } = require('../config/db');
const orderSvc    = require('../services/orderService');
const ptlSvc      = require('../services/putToLightService');

async function getSummary(req, res, next) {
    try {
        const pool = await getPool();
        const [orderSummary, activeSessions, recentRes, throughputRes, lowStockRes] = await Promise.all([
            orderSvc.getOrderSummary(),
            ptlSvc.getActiveSessions(),
            pool.request().query(`
                SELECT TOP 5 o.OrderID, o.OrderNumber, o.CustomerName,
                    o.Status, o.Priority, o.TotalItems, o.PutItems,
                    o.CreatedAt, b.BinCode, s.StationCode
                FROM GTP_Orders o
                LEFT JOIN GTP_Bins      b ON b.BinID     = o.AssignedBinID
                LEFT JOIN GTP_Stations  s ON s.StationID = b.StationID
                ORDER BY o.CreatedAt DESC
            `),
            pool.request().query(`
                SELECT
                    CAST(CompletedAt AS DATE) AS Day,
                    COUNT(*) AS OrdersCompleted
                FROM GTP_Orders
                WHERE Status='Completed'
                  AND CompletedAt >= DATEADD(day,-7,GETDATE())
                GROUP BY CAST(CompletedAt AS DATE)
                ORDER BY Day
            `),
            pool.request().query(`
                SELECT TOP 10 ItemCode, ItemName, AvailableQty, ReservedQty, MinQty,
                    (AvailableQty - ReservedQty) AS FreeQty
                FROM GTP_Inventory
                WHERE IsActive=1 AND (AvailableQty - ReservedQty) <= MinQty
                ORDER BY (AvailableQty - ReservedQty)
            `),
        ]);

        res.json({
            success: true,
            data: {
                orderCounts:   orderSummary,
                activeSessions: activeSessions.length,
                recentOrders:  recentRes.recordset,
                throughput:    throughputRes.recordset,
                lowStockItems: lowStockRes.recordset,
            },
        });
    } catch (err) { next(err); }
}

async function getStationStatus(req, res, next) {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                s.StationID, s.StationCode, s.StationName, s.IsActive,
                COUNT(b.BinID)                                           AS TotalBins,
                SUM(CASE WHEN b.CurrentOrderID IS NOT NULL THEN 1 ELSE 0 END) AS ActiveBins,
                SUM(CASE WHEN b.CurrentOrderID IS NULL AND b.IsActive=1 THEN 1 ELSE 0 END) AS FreeBins
            FROM GTP_Stations s
            LEFT JOIN GTP_Bins b ON b.StationID = s.StationID
            GROUP BY s.StationID, s.StationCode, s.StationName, s.IsActive
            ORDER BY s.StationCode
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) { next(err); }
}

module.exports = { getSummary, getStationStatus };
