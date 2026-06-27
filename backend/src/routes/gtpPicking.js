const router      = require('express').Router();
const ctrl        = require('../controllers/gtpPickingController');
const delivCtrl   = require('../controllers/deliveryController');
const statusCtrl  = require('../controllers/picklistStatusController');
const lightCtrl   = require('../controllers/lightController');

router.get('/picklist/:headerId',                               ctrl.loadPicklist);
router.get('/picklist/:headerId/resume',                        ctrl.resumeSession);
router.post('/session/start',                                   ctrl.startSession);
router.get('/session/:sessionId',                               ctrl.getSession);
router.post('/session/:sessionId/scan',                         ctrl.processScan);

// Delivery log + retry
router.get('/session/:sessionId/deliveries',                    delivCtrl.getDeliveries);
router.post('/session/:sessionId/deliveries/:cardCode/retry',   delivCtrl.retryDelivery);

// Picklist status overview
router.get('/sessions',                                         statusCtrl.getSessions);

// Station light status
router.get('/lights/:stationId',                                lightCtrl.getLightStatus);
router.post('/session/:sessionId/lights/reset',                 lightCtrl.resetLights);

module.exports = router;
