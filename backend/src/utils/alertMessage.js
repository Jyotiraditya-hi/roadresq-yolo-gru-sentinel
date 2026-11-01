const { APP_URL, LOCATION_MAX_AGE_SECONDS } = require('../constants');

function buildAlertMessage({ user, incident, location }) {
  const lines = [
    'RoadResQ ALERT: Possible accident detected.',
    `Car No: ${user.carNo}`,
    `Driver phone: ${user.phoneNumber}`,
  ];

  if (location && location.lat != null && location.lng != null) {
    lines.push(`Location: https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lng.toFixed(5)}`);
    const ageSec = location.updatedAt ? (Date.now() - new Date(location.updatedAt).getTime()) / 1000 : null;
    if (ageSec !== null && ageSec > LOCATION_MAX_AGE_SECONDS) {
      lines.push(`(location is ${Math.round(ageSec / 60)} min old)`);
    }
  } else {
    lines.push('Location: unavailable');
  }

  lines.push(`Live track: ${APP_URL}/track/${incident.trackingToken}`);
  lines.push(
    `Time: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}`
  );
  return lines.join('\n');
}

module.exports = buildAlertMessage;
