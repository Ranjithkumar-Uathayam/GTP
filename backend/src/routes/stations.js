const router = require('express').Router();
const ctrl   = require('../controllers/stationController');

router.get('/',           ctrl.list);
router.get('/:id',        ctrl.getOne);
router.post('/',          ctrl.create);
router.post('/:id/bins',  ctrl.addBin);

module.exports = router;
