const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema(
  { name: { type: String, trim: true }, phone: { type: String, trim: true, required: true } },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, unique: true, trim: true },
    additionalPhone: { type: String, trim: true }, // also alerted in an emergency
    carNo: { type: String, required: true, trim: true, uppercase: true },
    familyContacts: [ContactSchema],               // more people to alert
    passwordHash: { type: String, required: true, select: false },
    consentToShare: { type: Boolean, required: true }, // agreed to share phone/car/location in an emergency
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);