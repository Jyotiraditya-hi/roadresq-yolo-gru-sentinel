const Incident = require('../models/Incident.model');
const User = require('../models/User.model');
const Trip = require('../models/Trip.model');
const buildAlertMessage = require('./alertMessage');
const sendSms = require('./sendSms');
const { findNearestAuthority } = require('./findNearestAuthority');

// Sends the alerts for one incident. Safe to call twice: the status flip below is atomic,
// so only the first call (and only if the user did not cancel) goes on to send SMS.
async function notify(incidentId) {
  const claimed = await Incident.findOneAndUpdate(
    { _id: incidentId, status: 'countdown' },
    { status: 'notified', notifiedAt: new Date() },
    { new: true }
  );
  if (!claimed) return; // cancelled, or already sent

  const result = { smsSent: false, familyNotified: 0 };
  try {
    const user = await User.findById(claimed.userId);
    if (!user) throw new Error('User not found');

    // newest position: the live trip, else the position saved with the incident
    let location = claimed.location && claimed.location.lat != null
      ? { lat: claimed.location.lat, lng: claimed.location.lng, updatedAt: claimed.locationUpdatedAt }
      : null;
    if (claimed.tripId) {
      const trip = await Trip.findById(claimed.tripId);
      const live = trip && trip.lastKnownLocation;
      if (live && live.lat != null) location = { lat: live.lat, lng: live.lng, updatedAt: live.updatedAt };
    }

    const message = buildAlertMessage({ user, incident: claimed, location });

    // 1) family first (we always have their numbers)
    const family = [...new Set([
      user.additionalPhone,
      ...user.familyContacts.map((c) => c.phone),
    ].filter(Boolean))];
    for (const phone of family) {
      try {
        await sendSms(phone, message);
        result.familyNotified += 1;
      } catch (e) {
        result.error = `family SMS failed: ${e.message}`;
      }
    }

    // 2) nearest authority (needs a location)
    if (!location) {
      result.error = (result.error ? result.error + '; ' : '') + 'no location, authority not alerted';
    } else {
      try {
        const authority = await findNearestAuthority(location.lat, location.lng);
        if (!authority) {
          result.error = (result.error ? result.error + '; ' : '') + 'no police station found nearby (user should call 112)';
        } else {
          result.authorityName = authority.name;
          result.authorityPhone = authority.phone || undefined;
          if (authority.mobile) {
            await sendSms(authority.mobile, message);
            result.smsSent = true;
          } else {
            result.error = (result.error ? result.error + '; ' : '') +
              `${authority.name} has no SMS-capable number (call it or use 112)`;
          }
        }
      } catch (e) {
        result.error = (result.error ? result.error + '; ' : '') + `authority lookup/SMS failed: ${e.message}`;
      }
    }
  } catch (e) {
    result.error = e.message;
  }

  await Incident.findByIdAndUpdate(incidentId, { alertResult: result });
  console.log(`Alert for incident ${incidentId}:`, result);
}

// Wait for the cancel window, then send. (setTimeout is lost on restart -> see recoverPendingAlerts.)
function scheduleAlert(incidentId, seconds) {
  setTimeout(() => notify(incidentId).catch((e) => console.error('notify failed:', e)), seconds * 1000);
}

// Call once at startup: re-schedule countdowns that were pending when the server stopped.
async function recoverPendingAlerts() {
  const pending = await Incident.find({ status: 'countdown' }).select('_id alertAt');
  for (const inc of pending) {
    const wait = Math.max(0, (inc.alertAt ? inc.alertAt.getTime() : 0) - Date.now());
    scheduleAlert(inc._id, wait / 1000);
  }
  if (pending.length) console.log(`Recovered ${pending.length} pending alert(s)`);
}

module.exports = { notify, scheduleAlert, recoverPendingAlerts };
