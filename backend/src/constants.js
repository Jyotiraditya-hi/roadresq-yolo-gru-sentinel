// Single place for env loading + shared values. Every other file imports from here.
// This file lives in backend/src, so backend/ (where .env and uploads live) is one level up.
const path = require('path');
const BACKEND_ROOT = path.join(__dirname, '..');

require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') });

// stop early instead of running with no / default secret
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing in .env');
}
if (process.env.JWT_SECRET === 'put-a-long-random-string-here') {
  console.warn('WARNING: JWT_SECRET is still the placeholder. Replace it with a long random string.');
}

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roadresq',
  DB_NAME: 'roadresq',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  APP_URL: process.env.APP_URL || 'http://localhost:3000', // used in the SMS tracking link
  DETECTOR_URL: process.env.DETECTOR_URL || 'http://127.0.0.1:8000',
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 200),
  UPLOAD_DIR: path.join(BACKEND_ROOT, 'uploads'),
  // resolved from backend/ (same as the value written in .env)
  SNAPSHOT_DIR: path.resolve(BACKEND_ROOT, process.env.SNAPSHOT_DIR || '../inference-service/snapshots'),

  // auth
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // alerts
  ALERT_DELAY_SECONDS: Number(process.env.ALERT_DELAY_SECONDS || 30), // cancel window
  LOCATION_MAX_AGE_SECONDS: Number(process.env.LOCATION_MAX_AGE_SECONDS || 120), // older = "stale"
  TRACK_LINK_HOURS: Number(process.env.TRACK_LINK_HOURS || 6), // live-track link expires after this
  SMS_API_KEY: process.env.SMS_API_KEY,
  SMS_SENDER_ID: process.env.SMS_SENDER_ID,

  STATUSES: ['pending', 'countdown', 'notified', 'cancelled', 'reviewed', 'dismissed'],
};