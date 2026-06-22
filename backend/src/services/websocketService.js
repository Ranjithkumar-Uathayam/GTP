const WebSocket = require('ws');

let wss = null;

function init(server) {
    wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        console.log(`🔌 WS client connected (${wss.clients.size} total)`);
        ws.send(JSON.stringify({ type: 'connected', message: 'GTP Station WebSocket ready' }));

        ws.on('close', () => {
            console.log(`🔌 WS client disconnected (${wss.clients.size} remaining)`);
        });

        ws.on('error', (err) => console.error('WS error:', err.message));
    });
}

function broadcast(type, data) {
    if (!wss) return;
    const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Convenience event helpers used by services
const events = {
    binActivated:   (binData)   => broadcast('BIN_ACTIVATED',   binData),
    binDeactivated: (binData)   => broadcast('BIN_DEACTIVATED', binData),
    itemConfirmed:  (itemData)  => broadcast('ITEM_CONFIRMED',  itemData),
    orderStarted:   (order)     => broadcast('ORDER_STARTED',   order),
    orderCompleted: (order)     => broadcast('ORDER_COMPLETED', order),
    orderCancelled: (order)     => broadcast('ORDER_CANCELLED', order),
    stationUpdate:  (station)   => broadcast('STATION_UPDATE',  station),
    inventoryUpdate:(inv)       => broadcast('INVENTORY_UPDATE',inv),
};

module.exports = { init, broadcast, ...events };
