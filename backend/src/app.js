// Express app only (no listen / no DB connect) — index.js starts it.
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { CLIENT_ORIGIN, SNAPSHOT_DIR } = require('./constants');
const authRoutes = require('./routes/auth.routes');
const tripRoutes = require('./routes/trips.routes');
const analyzeRoutes = require('./routes/analyze.routes');
const incidentRoutes = require('./routes/incidents.routes');
const trackRoutes = require('./routes/track.routes');

const app = express();

// uncomment if you deploy behind a proxy (Render, Nginx, etc.)
// app.set('trust proxy', 1);

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' });
});

// public: signup / login
app.use('/api/auth', authRoutes);

// login required: start trip, send live location, end trip
app.use('/api/trips', tripRoutes);

// login required (auth is added inside these route files)
app.use('/api', analyzeRoutes);
app.use('/api', incidentRoutes);

// public (token only): GET /api/track/:token  -> the live-map link sent in the SMS
app.use('/api', trackRoutes);

// snapshot images written by the Python service
app.use('/snapshots', express.static(SNAPSHOT_DIR));

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// error handler (keep last)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;