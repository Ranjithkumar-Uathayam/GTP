const ptlSvc = require('../services/putToLightService');

async function startOrder(req, res, next) {
    try {
        const { operatorId, stationId } = req.body;
        const result = await ptlSvc.startOrder(
            parseInt(req.params.orderId),
            operatorId ? parseInt(operatorId) : null,
            stationId  ? parseInt(stationId)  : null,
        );
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function confirmItem(req, res, next) {
    try {
        const { orderId, itemId, qty, operatorId } = req.body;
        const result = await ptlSvc.confirmItem(
            parseInt(orderId),
            parseInt(itemId),
            qty    ? parseFloat(qty)    : undefined,
            operatorId ? parseInt(operatorId) : null,
        );
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function completeOrder(req, res, next) {
    try {
        const { operatorId } = req.body;
        await ptlSvc.completeOrder(
            parseInt(req.params.orderId),
            operatorId ? parseInt(operatorId) : null,
        );
        res.json({ success: true, message: 'Order completed' });
    } catch (err) { next(err); }
}

async function cancelOrder(req, res, next) {
    try {
        const { operatorId } = req.body;
        await ptlSvc.cancelOrder(
            parseInt(req.params.orderId),
            operatorId ? parseInt(operatorId) : null,
        );
        res.json({ success: true, message: 'Order cancelled' });
    } catch (err) { next(err); }
}

async function scanItem(req, res, next) {
    try {
        const { orderNumber, itemCode, qty, operatorId } = req.body;
        if (!orderNumber || !itemCode)
            return res.status(400).json({ success: false, message: 'orderNumber and itemCode required', code: 'BAD_REQUEST' });
        const result = await ptlSvc.scanQr(
            orderNumber,
            itemCode,
            qty    ? parseFloat(qty)    : 0,
            operatorId ? parseInt(operatorId) : null,
        );
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function getActive(req, res, next) {
    try {
        const sessions = await ptlSvc.getActiveSessions();
        res.json({ success: true, data: sessions });
    } catch (err) { next(err); }
}

async function getEventLog(req, res, next) {
    try {
        const events = await ptlSvc.getEventLog(parseInt(req.params.orderId));
        res.json({ success: true, data: events });
    } catch (err) { next(err); }
}

module.exports = { startOrder, confirmItem, completeOrder, cancelOrder, scanItem, getActive, getEventLog };
