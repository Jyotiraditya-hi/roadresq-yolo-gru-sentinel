const mongoose = require('mongoose');
const { MONGO_URI, DB_NAME } = require('../constants');

async function connectDB() {
  console.log('Using:', MONGO_URI.startsWith('mongodb+srv://') ? 'MongoDB Atlas' : 'LOCAL MongoDB');

  await mongoose.connect(MONGO_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 8000,
  });

  console.log(`MongoDB connected (${mongoose.connection.name})`);
}

module.exports = connectDB;