const router = require('express').Router();

router.use('/dashboard',    require('./dashboard'));
router.use('/picking',      require('./gtpPicking'));

router.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
