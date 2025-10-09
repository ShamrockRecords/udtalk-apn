const apn = require('apn');
const admin = require('firebase-admin');
const { APNS_TIMEOUT_MS, FCM_TIMEOUT_MS } = require('../config/timeouts');
const withTimeout = require('../utils/with-timeout');

const providers = new Map();

const getApnProvider = (production) => {
  if (!providers.has(production)) {
    providers.set(
      production,
      new apn.Provider({
        token: {
          key: process.env.APPLE_APNS_AUTH_KEY,
          keyId: process.env.APPLE_KEY_ID,
          teamId: process.env.APPLE_TEAM_ID,
        },
        production,
      }),
    );
  }

  return providers.get(production);
};

async function sendApplePush({ deviceToken, production, bundleId, message, signal }) {
  if (!deviceToken || !bundleId) {
    throw new Error('APNs requires deviceToken and bundleId');
  }

  const provider = getApnProvider(production);

  const note = new apn.Notification();
  note.badge = 0;
  note.body = message;
  note.topic = bundleId;
  note.sound = 'ping.aiff';
  note.pushType = 'alert';
  note.contentAvailable = true;
  note.priority = 5;

  const response = await withTimeout(
    () => provider.send(note, deviceToken),
    {
      timeout: APNS_TIMEOUT_MS,
      signal,
      label: 'apns_send',
    },
  );

  if (Array.isArray(response?.failed) && response.failed.length > 0) {
    const error = new Error('APNs push failed');
    error.response = response;
    throw error;
  }

  return response;
}

async function sendFirebasePush({ deviceToken, title, body, signal }) {
  if (!deviceToken) {
    throw new Error('FCM requires deviceToken');
  }

  const message = {
    notification: {
      title,
      body,
    },
    token: deviceToken,
  };

  return withTimeout(
    () => admin.messaging().send(message),
    {
      timeout: FCM_TIMEOUT_MS,
      signal,
      label: 'fcm_send',
    },
  );
}

function shutdownProviders() {
  providers.forEach((provider) => {
    try {
      provider.shutdown();
    } catch (error) {
      console.error('Failed to shutdown APNs provider', error);
    }
  });
  providers.clear();
}

process.on('exit', shutdownProviders);

module.exports = {
  sendApplePush,
  sendFirebasePush,
  shutdownProviders,
};
