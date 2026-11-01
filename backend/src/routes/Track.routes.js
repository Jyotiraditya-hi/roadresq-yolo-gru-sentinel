const express = require('express');

const Incident = require('../models/Incident.model');
const Trip = require('../models/Trip.model');
const { TRACK_LINK_HOURS } = require('../constants');

const router = express.Router();

// GET /api/track/:token   PUBLIC - opened from the SMS link, no login.
// The long random token is the only protection, so it expires and never lists other data.
router.get('/track/:token', async (req, res, next) => {
  try {
    const incident = await Incident.findOne({ trackingToken: req.params.token });
    if (!incident || incident.status === 'cancelled') {
      return res.status(404).json({ error: 'Tracking link not found' });
    }

    const ageMs = Date.now() - incident.createdAt.getTime();
    if (ageMs > TRACK_LINK_HOURS * 3600 * 1000) {
      return res.status(410).json({ error: 'Tracking link has expired' });
    }

    // newest position: the live trip if it is still sending, else the position saved at crash time
    let loc = incident.location && incident.location.lat != null
      ? { lat: incident.location.lat, lng: incident.location.lng, updatedAt: incident.locationUpdatedAt }
      : null;

    if (incident.tripId) {
      const trip = await Trip.findById(incident.tripId);
      const live = trip && trip.lastKnownLocation;
      if (live && live.lat != null) loc = { lat: live.lat, lng: live.lng, updatedAt: live.updatedAt };
    }

    res.json({
      status: incident.status,
      carNo: incident.plateNumber,
      driverPhone: incident.phoneNumber,
      detectedAt: incident.createdAt,
      confidence: incident.confidence,
      snapshotUrl: incident.snapshotUrl,
      location: loc && {
        ...loc,
        ageSeconds: loc.updatedAt ? Math.round((Date.now() - new Date(loc.updatedAt).getTime()) / 1000) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;