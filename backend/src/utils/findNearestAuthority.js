const axios = require('axios');

// Public Overpass (OpenStreetMap) servers. Any one of them can be slow or overloaded,
// so we try them in order. Override with OVERPASS_URLS=url1,url2 in .env if you like.
const DEFAULT_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const OVERPASS_URLS = process.env.OVERPASS_URLS
  ? process.env.OVERPASS_URLS.split(',').map((u) => u.trim()).filter(Boolean)
  : DEFAULT_URLS;
const TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 15000); // per server
const RADII_KM = [10, 25, 50]; // widen the search until something is found

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Returns a +91XXXXXXXXXX number from a map "phone" tag (may hold several numbers), or null
// if there is only a landline (landlines cannot receive SMS).
function pickMobile(phoneTag) {
  if (!phoneTag) return null;
  for (const part of String(phoneTag).split(/[;,/]/)) {
    const digits = part.replace(/[^\d]/g, '');
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10) && (digits.length === 10 || digits.startsWith('91'))) {
      return `+91${last10}`;
    }
  }
  return null;
}

// Ask one radius, trying each server until one answers.
async function searchRadius(lat, lng, km) {
  const m = km * 1000;
  const query = `[out:json][timeout:12];
(node["amenity"="police"](around:${m},${lat},${lng});
 way["amenity"="police"](around:${m},${lat},${lng}););
out center tags;`;

  let data = null;
  let lastErr = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await axios.post(url, 'data=' + encodeURIComponent(query), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RoadResQ/1.0' },
        timeout: TIMEOUT_MS,
      });
      data = res.data;
      break;
    } catch (e) {
      lastErr = e; // timeout, 429 (busy), 5xx, DNS error -> try the next server
    }
  }
  if (!data) {
    throw new Error(`map servers did not answer (${lastErr ? lastErr.message : 'no server'})`);
  }

  return (data.elements || [])
    .map((el) => {
      const eLat = el.lat ?? el.center?.lat;
      const eLng = el.lon ?? el.center?.lon;
      if (eLat == null || eLng == null) return null;
      const tags = el.tags || {};
      const phoneTag = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
      return {
        name: tags.name || 'Police station',
        phone: phoneTag,
        mobile: pickMobile(phoneTag), // SMS-capable number, or null
        lat: eLat,
        lng: eLng,
        distanceKm: Number(distanceKm(lat, lng, eLat, eLng).toFixed(1)),
        isHighway: /highway|expressway|nhai|traffic/i.test(tags.name || ''),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Nearest police / highway police around the crash point (OpenStreetMap).
// Returns { name, phone, mobile, distanceKm, ... } or null if nothing was found.
async function findNearestAuthority(lat, lng) {
  for (const km of RADII_KM) {
    const found = await searchRadius(lat, lng, km);
    if (found.length) {
      // prefer a station named "highway/traffic", then one we can actually SMS, then the closest
      return found.find((f) => f.isHighway && f.mobile) || found.find((f) => f.mobile) || found[0];
    }
  }
  return null;
}

module.exports = { findNearestAuthority, pickMobile };