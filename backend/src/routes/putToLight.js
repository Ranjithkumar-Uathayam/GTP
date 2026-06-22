const router = require('express').Router();
const ctrl   = require('../controllers/putToLightController');

router.get('/active',                    ctrl.getActive);
router.post('/start/:orderId',           ctrl.startOrder);
router.post('/confirm',                  ctrl.confirmItem);
router.post('/scan',                     ctrl.scanItem);
router.post('/complete/:orderId',        ctrl.completeOrder);
router.post('/cancel/:orderId',          ctrl.cancelOrder);
router.get('/events/:orderId',           ctrl.getEventLog);

module.exports = router;
