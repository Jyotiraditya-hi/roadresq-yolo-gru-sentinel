const express = require('express');
const mongoose = require('mongoose');

const Incident = require('../models/Incident.model');
const auth = require('../middlewares/auth.middleware');

const router = express.Router();

// statuses a user may set by hand. 'countdown' / 'notified' are set by the system,
// and 'cancelled' has its own route (POST /incidents/:id/cancel).
const USER_SETTABLE_STATUSES = ['reviewed', 'dismissed'];

function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  next();
}

// NOTE: auth is added per route (not router.use) so it doesn't block
// public routes mounted later under /api, like GET /api/track/:token.

// GET /api/incidents?status=pending&collisionDetected=true&page=1&limit=50
// returns only the logged-in user's incidents
router.get('/incidents', auth, async (req, res, next) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.collisionDetected !== undefined) {
      filter.collisionDetected = req.query.collisionDetected === 'true';
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [items, total] = await Promise.all([
      Incident.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Incident.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /api/incidents/:id   (only if it belongs to the logged-in user)
router.get('/incidents/:id', auth, checkId, async (req, res, next) => {
  try {
    const doc = await Incident.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// POST /api/incidents/:id/cancel   ("I'm safe" button during the countdown)
// Atomic: only cancels if the incident is still in 'countdown', so it can't
// race with the alert being sent.
router.post('/incidents/:id/cancel', auth, checkId, async (req, res, next) => {
  try {
    const doc = await Incident.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: 'countdown' },
      { status: 'cancelled', alertAt: null },
      { new: true }
    );
    if (!doc) {
      return res
        .status(409)
        .json({ error: 'Cannot cancel: incident not found, or the alert was already sent or cancelled' });
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/incidents/:id/status   body: { "status": "reviewed" }
router.patch('/incidents/:id/status', auth, checkId, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!USER_SETTABLE_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of: ${USER_SETTABLE_STATUSES.join(', ')}` });
    }
    const doc = await Incident.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;