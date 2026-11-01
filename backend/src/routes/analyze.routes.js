const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');

const Incident = require('../models/Incident.model');
const Trip = require('../models/Trip.model');
const auth = require('../middlewares/auth.middleware');
const { scheduleAlert } = require('../utils/notify');
const { DETECTOR_URL, MAX_UPLOAD_MB, UPLOAD_DIR, ALERT_DELAY_SECONDS } = require('../constants');

const router = express.Router();

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Please upload a video file'));
  },
});

// fallback location from form fields: lat, lng, address
function buildLocation(body) {
  const lat = body.lat !== undefined && body.lat !== '' ? Number(body.lat) : undefined;
  const lng = body.lng !== undefined && body.lng !== '' ? Number(body.lng) : undefined;
  if (lat === undefined && lng === undefined && !body.address) return undefined;
  return { lat, lng, address: body.address };
}

// POST /api/analyze   (login required; multipart form-data, video field name: "video")
router.post('/analyze', auth, upload.single('video'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded (use the field name "video")' });
  const tmpPath = req.file.path;

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpPath), req.file.originalname || 'video.mp4');

    // send the video to the Python service (inference-service/server.py: YOLO + GRU)
    const { data } = await axios.post(`${DETECTOR_URL}/analyze`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 5 * 60 * 1000,
    });

    // location: newest live position from the user's active trip, else the form fields
    const trip = await Trip.findOne({ userId: req.user._id, active: true });
    const live = trip && trip.lastKnownLocation;
    const useLive = live && live.lat != null && live.lng != null;
    const location = useLive ? { lat: live.lat, lng: live.lng, address: req.body.address } : buildLocation(req.body);

    const incident = await Incident.create({
      userId: req.user._id,
      tripId: trip ? trip._id : null,
      originalName: req.file.originalname,
      phoneNumber: req.user.phoneNumber,
      plateNumber: req.user.carNo,
      location,
      locationUpdatedAt: useLive ? live.updatedAt : null,
      collisionDetected: data.collision_detected,
      confidence: data.confidence,
      impactFrame: data.impact_frame,
      vehiclesInvolved: data.vehicles_involved || [],
      snapshotUrl: data.snapshot_url ? `/snapshots/${data.snapshot_url}` : null,
    });

    // crash -> start the cancel countdown, then alert family + nearest authority
    if (incident.collisionDetected) {
      incident.status = 'countdown';
      incident.trackingToken = crypto.randomBytes(16).toString('hex');
      incident.alertAt = new Date(Date.now() + ALERT_DELAY_SECONDS * 1000);
      await incident.save();
      scheduleAlert(incident._id, ALERT_DELAY_SECONDS);
    }

    res.json({ ...incident.toObject(), cancelWithinSeconds: incident.status === 'countdown' ? ALERT_DELAY_SECONDS : 0 });
  } catch (err) {
    if (err.response) {
      return res.status(502).json({ error: 'Detector service error', detail: err.response.data });
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: `Detector service is not running at ${DETECTOR_URL}` });
    }
    next(err);
  } finally {
    fs.unlink(tmpPath, () => {});
  }
});

module.exports = router;