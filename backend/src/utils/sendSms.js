const { SMS_API_KEY } = require('../constants');

const PLACEHOLDERS = [undefined, '', 'your-sms-provider-key'];

// Sends ONE SMS. While SMS_API_KEY is still a placeholder this only prints the message
// to the terminal (dev mode), so you can test the whole flow without sending anything real.
async function sendSms(to, message) {
  if (PLACEHOLDERS.includes(SMS_API_KEY)) {
    console.log(`\n[DEV SMS] to ${to}\n${message}\n`);
    return { ok: true, dev: true };
  }

  // TODO: connect your SMS provider here (MSG91 / Fast2SMS / Twilio) with axios.
  // India needs a DLT-registered message template - follow your provider's setup guide.
  throw new Error('SMS provider not connected: add the API call in utils/sendSms.js');
}

module.exports = sendSms;
