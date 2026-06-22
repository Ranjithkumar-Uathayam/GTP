const router = require('express').Router();

router.use('/dashboard',    require('./dashboard'));
router.use('/orders',       require('./orders'));
router.use('/put-to-light', require('./putToLight'));
router.use('/inventory',    require('./inventory'));
router.use('/stations',     require('./stations'));
router.use('/picking',      require('./gtpPicking'));

router.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
