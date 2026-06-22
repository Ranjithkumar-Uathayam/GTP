const { getPool } = require('../config/db');

async function getSummary(req, res, next) {
    try {
        const pool = await getPool();
        const [sessionCountsRes, recentRes, throughputRes] = await Promise.all([
            pool.request().query(`
                SELECT
                    COUNT(*)                                                       AS Total,
                    SUM(CASE WHEN Status='InProgress' THEN 1 ELSE 0 END)          AS InProgress,
                    SUM(CASE WHEN Status='Completed'  THEN 1 ELSE 0 END)          AS Completed,
                    SUM(CASE WHEN Status='Abandoned'  THEN 1 ELSE 0 END)          AS Abandoned
                FROM GTP_PicklistSessions
            `),
            pool.request().query(`
                SELECT TOP 10
                    S.SessionID, S.HeaderId, S.Status, S.StartedAt, S.CompletedAt,
                    COUNT(DISTINCT PP.CardCode) AS TotalParties,
                    SUM(PP.RequiredQty)         AS TotalQty,
                    SUM(PP.PickedQty)           AS PickedQty
                FROM GTP_PicklistSessions S
                LEFT JOIN GTP_PickProgress PP ON PP.SessionID = S.SessionID
                GROUP BY S.SessionID, S.HeaderId, S.Status, S.StartedAt, S.CompletedAt
                ORDER BY S.StartedAt DESC
            `),
            pool.request().query(`
                SELECT
                    CAST(CompletedAt AS DATE) AS Day,
                    COUNT(*) AS SessionsCompleted
                FROM GTP_PicklistSessions
                WHERE Status='Completed'
                  AND CompletedAt >= DATEADD(day,-7,GETDATE())
                GROUP BY CAST(CompletedAt AS DATE)
                ORDER BY Day
            `),
        ]);

        res.json({
            success: true,
            data: {
                sessionCounts:   sessionCountsRes.recordset[0],
                recentSessions:  recentRes.recordset,
                throughput:      throughputRes.recordset,
            },
        });
    } catch (err) { next(err); }
}

async function getStationStatus(req, res, next) {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                S.SessionID, S.HeaderId, S.Status, S.StartedAt,
                COUNT(DISTINCT PP.CardCode)                              AS TotalParties,
                SUM(CASE WHEN PP.Status='Completed' THEN 1 ELSE 0 END)  AS CompletedParties
            FROM GTP_PicklistSessions S
            LEFT JOIN GTP_PickProgress PP ON PP.SessionID = S.SessionID
            WHERE S.Status = 'InProgress'
            GROUP BY S.SessionID, S.HeaderId, S.Status, S.StartedAt
            ORDER BY S.StartedAt DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) { next(err); }
}

module.exports = { getSummary, getStationStatus };
