const router = require('express').Router();
const ctrl   = require('../controllers/inventoryController');

router.get('/',            ctrl.list);
router.get('/:itemCode',   ctrl.getOne);
router.post('/adjust',     ctrl.adjust);
router.post('/bulk-sync',  ctrl.bulkUpsert);

module.exports = router;
