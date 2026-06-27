require('dotenv').config();
const http     = require('http');
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const { Server } = require('socket.io');

const routes          = require('./src/routes');
const { initDb }      = require('./src/config/db');
const wsService       = require('./src/services/websocketService');
const adamService     = require('./src/services/Adam6052Service');
const adamSocket      = require('./src/socket/adam.socket');
const lightSocket     = require('./src/socket/light.socket');
const lightService    = require('./src/services/lightControlService');
const errorHandler    = require('./src/middleware/errorHandler');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/api', routes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await initDb();
        console.log('✅ Database connected');

        // Sync light DB state with ADAM hardware (all OFF on every startup)
        await lightService.resetAllLightStates();

        wsService.init(server);
        console.log('✅ WebSocket attached to HTTP server');

        adamSocket.init(io);
        lightSocket.init(io);
        await adamService.start();   // diagnostics + Modbus TCP connect
        console.log('✅ ADAM-6052 Modbus TCP service started');

        server.listen(PORT, () => {
            console.log(`🚀 GTP Station API  → http://localhost:${PORT}/api`);
            console.log(`🔌 WebSocket        → ws://localhost:${PORT}`);
            console.log(`📡 ADAM Socket.IO   → http://localhost:${PORT} (namespace /adam)`);
        });
    } catch (err) {
        console.error('❌ Startup failed:', err.message);
        process.exit(1);
    }
}

start();
