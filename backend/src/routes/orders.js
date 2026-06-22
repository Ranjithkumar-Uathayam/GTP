const router = require('express').Router();
const ctrl   = require('../controllers/orderController');

router.get('/',         ctrl.list);
router.get('/:id',      ctrl.getOne);
router.post('/',        ctrl.create);
router.delete('/:id',   ctrl.cancel);

module.exports = router;
