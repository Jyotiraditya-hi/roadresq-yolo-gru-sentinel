const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User.model');
const auth = require('../middlewares/auth.middleware');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../constants');

const router = express.Router();

function normalizePhone(v) {
  const p = String(v || '').replace(/[\s-]/g, '');
  return /^\+?\d{10,13}$/.test(p) ? p : null;
}

const signToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

function publicUser(u) {
  return {
    id: u._id,
    name: u.name,
    phoneNumber: u.phoneNumber,
    additionalPhone: u.additionalPhone,
    carNo: u.carNo,
    familyContacts: u.familyContacts,
  };
}

// POST /api/auth/signup
// body: { name, phoneNumber, additionalPhone?, carNo, password, consentToShare: true, familyContacts?: [{name, phone}] }
router.post('/signup', async (req, res, next) => {
  try {
    const { name, carNo, password, consentToShare, familyContacts } = req.body;
    const phoneNumber = normalizePhone(req.body.phoneNumber);
    const additionalPhone = req.body.additionalPhone ? normalizePhone(req.body.additionalPhone) : undefined;

    if (!name || !carNo) return res.status(400).json({ error: 'name and carNo are required' });
    if (!phoneNumber) return res.status(400).json({ error: 'A valid phoneNumber is required' });
    if (req.body.additionalPhone && !additionalPhone) {
      return res.status(400).json({ error: 'additionalPhone is not a valid phone number' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    if (consentToShare !== true) {
      return res.status(400).json({ error: 'You must agree to share your details with authorities and family in an emergency' });
    }

    const contacts = (Array.isArray(familyContacts) ? familyContacts : [])
      .map((c) => ({ name: c.name, phone: normalizePhone(c.phone) }))
      .filter((c) => c.phone);

    const user = await User.create({
      name,
      phoneNumber,
      additionalPhone,
      carNo,
      familyContacts: contacts,
      passwordHash: await bcrypt.hash(String(password), 10),
      consentToShare: true,
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'This phone number is already registered' });
    next(err);
  }
});

// POST /api/auth/login   body: { phoneNumber, password }
router.post('/login', async (req, res, next) => {
  try {
    const phoneNumber = normalizePhone(req.body.phoneNumber);
    const { password } = req.body;
    if (!phoneNumber || !password) return res.status(400).json({ error: 'phoneNumber and password are required' });

    const user = await User.findOne({ phoneNumber }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Wrong phone number or password' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;