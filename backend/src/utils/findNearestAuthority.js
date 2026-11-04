const axios = require('axios');

// Your own contact list (MongoDB) is OPTIONAL: if you never loaded one, or the model file is
// missing, the lookup goes straight to Geoapify.
let Authority = null;
try { Authority = require('../models/Authority.model'); } catch (e) { /* optional */ }

// Search order around the crash point:
//   1. your own list (only if you loaded one with `npm run seed:authorities`)
//   2. Geoapify Places API -> nearest police stations, then Place Details API -> phone numbers
//   3. nothing found -> null (the app tells the user to call 112)

const GEOAPIFY = 'https://api.geoapify.com/v2';
const POLICE_CATEGORY = process.env.GEOAPIFY_POLICE_CATEGORY || 'service.police';
const MAP_RADII_KM = [10, 25, 50]; // widen the search until something is found
const DETAIL_LOOKUPS = 5;          // phone lookups per alert (1 credit each on the free plan)
const OWN_MAX_KM = Number(process.env.AUTHORITY_MAX_KM || 100);
const OWN_RADII_KM = [25, 50, OWN_MAX_KM].filter((k, i, a) => k <= OWN_MAX_KM && a.indexOf(k) === i);

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// +91XXXXXXXXXX from a phone text (may hold several numbers), or null if it is only a landline
function pickMobile(phoneText) {
  if (!phoneText) return null;
  for (const part of String(phoneText).split(/[;,/]/)) {
    const digits = part.replace(/[^\d]/g, '');
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10) && (digits.length === 10 || digits.startsWith('91'))) return `+91${last10}`;
  }
  return null;
}

// nearest one that can receive an SMS; otherwise the nearest one (shown for calling)
function best(list) {
  const sorted = [...list].sort((a, b) => a.distanceKm - b.distanceKm);
  return sorted.find((x) => x.mobile) || sorted[0] || null;
}

// ---------- 1. your own list (optional) ----------
async function searchOwnList(lat, lng) {
  if (!Authority || typeof Authority.find !== 'function') return null;
  try {
    for (const km of OWN_RADII_KM) {
      const docs = await Authority.find({
        active: true,
        location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: km * 1000 } },
      }).limit(5).lean();
      if (docs.length) {
        return best(docs.map((d) => {
          const [dLng, dLat] = d.location.coordinates;
          return {
            name: d.name, type: d.type, highway: d.highway,
            phone: d.phone || d.mobile || null, mobile: d.mobile || null,
            lat: dLat, lng: dLng, distanceKm: Number(distanceKm(lat, lng, dLat, dLng).toFixed(1)),
          };
        }));
      }
    }
  } catch (e) {
    console.warn('Own authority list not used:', e.message); // e.g. the list was never loaded
  }
  return null;
}

// ---------- 2. Geoapify ----------
async function placesNear(lat, lng, km, key) {
  const { data } = await axios.get(`${GEOAPIFY}/places`, {
    params: {
      categories: POLICE_CATEGORY,
      filter: `circle:${lng},${lat},${km * 1000}`, // longitude first
      bias: `proximity:${lng},${lat}`,
      limit: 10,
      apiKey: key,
    },
    timeout: 10000,
  });
  return ((data && data.features) || [])
    .map((f) => {
      const p = f.properties || {};
      const pLat = p.lat ?? (f.geometry && f.geometry.coordinates[1]);
      const pLng = p.lon ?? (f.geometry && f.geometry.coordinates[0]);
      if (pLat == null || pLng == null) return null;
      return {
        name: `${p.name || 'Police station'} (police station)`,
        type: 'police_station', highway: null, placeId: p.place_id,
        phone: null, mobile: null,
        lat: pLat, lng: pLng, distanceKm: Number(distanceKm(lat, lng, pLat, pLng).toFixed(1)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// The Places API gives no phone numbers; the Place Details API does (when OpenStreetMap has them).
async function addPhone(place, key) {
  if (!place.placeId) return place;
  try {
    const { data } = await axios.get(`${GEOAPIFY}/place-details`, {
      params: { id: place.placeId, apiKey: key }, timeout: 8000,
    });
    const feature = ((data && data.features) || []).find((f) => f.properties && f.properties.feature_type === 'details');
    const c = (feature && feature.properties.contact) || {};
    const phones = [c.phone, ...(c.phone_other || [])].filter(Boolean);
    return { ...place, phone: phones[0] || null, mobile: pickMobile(phones.join(';')) };
  } catch (e) {
    return place; // no phone for this one; still usable as a name and location
  }
}

async function searchGeoapify(lat, lng) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) {
    throw new Error('GEOAPIFY_API_KEY is not set in backend/.env (restart the server after adding it)');
  }
  for (const km of MAP_RADII_KM) {
    const found = await placesNear(lat, lng, km, key);
    if (found.length) {
      const top = found.slice(0, DETAIL_LOOKUPS);
      const withPhones = await Promise.all(top.map((p) => addPhone(p, key)));
      return best(withPhones);
    }
  }
  return null;
}

// Returns { name, phone, mobile, distanceKm, ... } or null if nothing was found.
async function findNearestAuthority(lat, lng) {
  console.log(`Authority lookup at ${lat}, ${lng}`);
  const own = await searchOwnList(lat, lng);
  if (own) {
    console.log(`  -> from your own list: ${own.name} (${own.distanceKm} km, mobile: ${own.mobile || 'none'})`);
    return own;
  }
  try {
    const found = await searchGeoapify(lat, lng);
    console.log(found
      ? `  -> from Geoapify: ${found.name} (${found.distanceKm} km, mobile: ${found.mobile || 'none'})`
      : '  -> nothing found within 50 km');
    return found;
  } catch (e) {
    throw new Error(`map lookup failed (${e.response ? 'status ' + e.response.status : e.message})`);
  }
}

module.exports = { findNearestAuthority, pickMobile };