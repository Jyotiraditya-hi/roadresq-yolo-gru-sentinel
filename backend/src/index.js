// Entry point: npm start  (runs node src/index.js)
const { PORT } = require('./constants'); // loads .env first
const connectDB = require('./db/index.db');
const app = require('./app');
const { recoverPendingAlerts } = require('./utils/notify');

connectDB()
  .then(async () => {
    await recoverPendingAlerts(); // re-schedule countdowns that were pending at last shutdown
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });