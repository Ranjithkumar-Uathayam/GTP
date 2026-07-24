const router = require('express').Router();

router.use('/picking',      require('./gtpPicking'));
router.use('/adam',         require('./adam.routes'));
router.use('/adam-devices', require('./adamDeviceConfig.routes'));

router.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
