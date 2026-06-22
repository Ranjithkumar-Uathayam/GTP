const stationSvc = require('../services/stationService');
const ws         = require('../services/websocketService');

async function list(req, res, next) {
    try {
        const stations = await stationSvc.getAllStations();
        res.json({ success: true, data: stations });
    } catch (err) { next(err); }
}

async function getOne(req, res, next) {
    try {
        const station = await stationSvc.getStationWithBins(parseInt(req.params.id));
        if (!station) return res.status(404).json({ success: false, message: 'Station not found' });
        res.json({ success: true, data: station });
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const station = await stationSvc.createStation(req.body);
        res.status(201).json({ success: true, data: station });
    } catch (err) { next(err); }
}

async function addBin(req, res, next) {
    try {
        const bin = await stationSvc.addBin(parseInt(req.params.id), req.body);
        ws.stationUpdate({ stationId: parseInt(req.params.id), bin });
        res.status(201).json({ success: true, data: bin });
    } catch (err) { next(err); }
}

module.exports = { list, getOne, create, addBin };
