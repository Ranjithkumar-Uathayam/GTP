require('dotenv').config();
const http     = require('http');
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const routes          = require('./src/routes');
const { initDb }      = require('./src/config/db');
const wsService       = require('./src/services/websocketService');
const errorHandler    = require('./src/middleware/errorHandler');

const app    = express();
const server = http.createServer(app);

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

        wsService.init(server);
        console.log('✅ WebSocket attached to HTTP server');

        server.listen(PORT, () => {
            console.log(`🚀 GTP Station API  → http://localhost:${PORT}/api`);
            console.log(`🔌 WebSocket        → ws://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('❌ Startup failed:', err.message);
        process.exit(1);
    }
}

start();
