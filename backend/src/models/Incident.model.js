const mongoose = require('mongoose');
const { STATUSES } = require('../constants');

const VehicleSchema = new mongoose.Schema(
  { class: String, bbox: [Number], area: Number, frame: Number },
  { _id: false }
);

const LocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    address: { type: String, trim: true },
  },
  { _id: false }
);

// what happened when the alert was sent (kept for records / debugging)
const AlertResultSchema = new mongoose.Schema(
  {
    authorityName: String,
    authorityPhone: String,
    smsSent: { type: Boolean, default: false },
    familyNotified: { type: Number, default: 0 }, // how many family numbers got the SMS
    error: String,
  },
  { _id: false }
);

const IncidentSchema = new mongoose.Schema(
  {
    // who it belongs to
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },

    // what the user sent
    originalName: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    plateNumber: { type: String, trim: true, uppercase: true },
    location: LocationSchema,
    locationUpdatedAt: { type: Date, default: null }, // when the phone last sent this location

    // what the YOLO + GRU service found
    collisionDetected: { type: Boolean, required: true },
    confidence: { type: Number, min: 0, max: 1 },
    impactFrame: { type: Number, default: null },
    vehiclesInvolved: [VehicleSchema],
    snapshotUrl: { type: String, default: null },

    // live tracking link (goes in the SMS: APP_URL/track/<trackingToken>)
    trackingToken: { type: String, unique: true, sparse: true },

    // follow-up
    status: { type: String, enum: STATUSES, default: 'pending' },
    alertAt: { type: Date, default: null }, // when the SMS will go out (end of countdown)
    notifiedAt: { type: Date, default: null },
    alertResult: AlertResultSchema,
  },
  { timestamps: true }
);

IncidentSchema.index({ createdAt: -1 });
IncidentSchema.index({ collisionDetected: 1, status: 1 });
IncidentSchema.index({ userId: 1, createdAt: -1 }); // "my incidents" list
IncidentSchema.index({ status: 1, alertAt: 1 });    // recover pending countdowns after a restart

module.exports = mongoose.model('Incident', IncidentSchema);