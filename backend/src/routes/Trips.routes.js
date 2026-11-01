const express = require('express');
const mongoose = require('mongoose');

const Trip = require('../models/Trip.model');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  next();
}

function parseCoords(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const ok =
    body.lat !== undefined && body.lng !== undefined &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return ok ? { lat, lng, accuracy: Number(body.accuracy) || undefined } : null;
}

// POST /api/trips/start   body (optional): { lat, lng }
router.post('/start', auth, async (req, res, next) => {
  try {
    // only one active trip per user
    await Trip.updateMany({ userId: req.user._id, active: true }, { active: false, endedAt: new Date() });

    const c = parseCoords(req.body);
    const trip = await Trip.create({
      userId: req.user._id,
      lastKnownLocation: c ? { ...c, updatedAt: new Date() } : undefined,
    });
    res.status(201).json(trip);
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:id/location   body: { lat, lng, accuracy? }   (phone sends this every 5-10 s)
router.post('/:id/location', auth, checkId, async (req, res, next) => {
  try {
    const c = parseCoords(req.body);
    if (!c) return res.status(400).json({ error: 'Valid lat and lng are required' });

    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, active: true },
      { lastKnownLocation: { ...c, updatedAt: new Date() } },
      { new: true }
    );
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });
    res.json({ ok: true, updatedAt: trip.lastKnownLocation.updatedAt });
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:id/end
router.post('/:id/end', auth, checkId, async (req, res, next) => {
  try {
    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, active: true },
      { active: false, endedAt: new Date() },
      { new: true }
    );
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });
    res.json(trip);
  } catch (err) {
    next(err);
  }
});

module.exports = router;