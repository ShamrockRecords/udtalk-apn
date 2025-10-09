const parseTimeout = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const APP_REQUEST_TIMEOUT_MS = parseTimeout(process.env.APP_REQUEST_TIMEOUT_MS, 28_000);
const FIRESTORE_TIMEOUT_MS = parseTimeout(process.env.FIRESTORE_TIMEOUT_MS, 5_000);
const APNS_TIMEOUT_MS = parseTimeout(process.env.APNS_TIMEOUT_MS, 10_000);
const FCM_TIMEOUT_MS = parseTimeout(process.env.FCM_TIMEOUT_MS, 8_000);

module.exports = {
  APP_REQUEST_TIMEOUT_MS,
  FIRESTORE_TIMEOUT_MS,
  APNS_TIMEOUT_MS,
  FCM_TIMEOUT_MS,
};
