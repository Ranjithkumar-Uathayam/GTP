const orderSvc = require('../services/orderService');

async function list(req, res, next) {
    try {
        const { page, limit, status, search, priority } = req.query;
        const result = await orderSvc.getOrdersPaged({
            page:     parseInt(page)  || 1,
            limit:    parseInt(limit) || 50,
            status, search,
            priority: parseInt(priority) || undefined,
        });
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

async function getOne(req, res, next) {
    try {
        const order = await orderSvc.getOrderById(parseInt(req.params.id));
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const order = await orderSvc.createOrder(req.body);
        res.status(201).json({ success: true, data: order });
    } catch (err) { next(err); }
}

async function cancel(req, res, next) {
    try {
        await orderSvc.deleteOrder(parseInt(req.params.id));
        res.json({ success: true, message: 'Order cancelled' });
    } catch (err) { next(err); }
}

module.exports = { list, getOne, create, cancel };
