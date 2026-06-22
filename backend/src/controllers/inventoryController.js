const inventorySvc = require('../services/inventoryService');
const ws           = require('../services/websocketService');

async function list(req, res, next) {
    try {
        const { page, limit, search, brand, lowStock } = req.query;
        const result = await inventorySvc.getInventoryPaged({
            page:  parseInt(page)  || 1,
            limit: parseInt(limit) || 50,
            search, brand, lowStock,
        });
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
}

async function getOne(req, res, next) {
    try {
        const item = await inventorySvc.getInventoryByCode(req.params.itemCode);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, data: item });
    } catch (err) { next(err); }
}

async function adjust(req, res, next) {
    try {
        const { itemCode, delta, reason } = req.body;
        const updated = await inventorySvc.adjustStock(itemCode, parseFloat(delta), reason);
        if (!updated) return res.status(404).json({ success: false, message: 'Item not found' });
        ws.inventoryUpdate(updated);
        res.json({ success: true, data: updated });
    } catch (err) { next(err); }
}

async function bulkUpsert(req, res, next) {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'items array required' });
        }
        await inventorySvc.upsertInventory(items);
        res.json({ success: true, message: `${items.length} items synced` });
    } catch (err) { next(err); }
}

module.exports = { list, getOne, adjust, bulkUpsert };
