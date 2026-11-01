const mongoose = require('mongoose');

const LiveLocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    accuracy: Number,
    updatedAt: Date,
  },
  { _id: false }
);

const TripSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    lastKnownLocation: LiveLocationSchema, // only the newest position is kept
  },
  { timestamps: true }
);

TripSchema.index({ userId: 1, active: 1 });

module.exports = mongoose.model('Trip', TripSchema);