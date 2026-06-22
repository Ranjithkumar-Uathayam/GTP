const router = require('express').Router();
const ctrl   = require('../controllers/dashboardController');

router.get('/summary',        ctrl.getSummary);
router.get('/station-status', ctrl.getStationStatus);

module.exports = router;
