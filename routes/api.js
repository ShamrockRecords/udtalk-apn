const express = require('express');
const createError = require('http-errors');
const admin = require('firebase-admin');

const { sendApplePush, sendFirebasePush } = require('../modules/push');
const { FIRESTORE_TIMEOUT_MS } = require('../config/timeouts');
const withTimeout = require('../utils/with-timeout');

const router = express.Router();
const firestore = admin.firestore();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ensureApiKey = (req) => {
  const providedKey = req.body.key || req.get('x-api-key');

  if (!providedKey || providedKey !== process.env.API_KEY) {
    const err = createError(401, 'Invalid API key');
    err.code = 'invalid_api_key';
    throw err;
  }
};

const runWithFirestoreTimeout = (res, task, label) =>
  withTimeout(task, {
    timeout: FIRESTORE_TIMEOUT_MS,
    signal: res.locals.abortSignal,
    label,
  });

const buildPayload = (body, overrides = {}) => {
  const payload = { ...body, ...overrides };
  delete payload.key;
  return payload;
};

const HEARTBEAT_THRESHOLD_MS = 70 * 1000;
const ACTIVE_WINDOW_MS = 120 * 60 * 1000;
const MIN_PUBLISH_INTERVAL_MS = 15 * 60 * 1000;

const getAppleBundleId = (type) => {
  if (type === 'iOS' || type === 'watchOS_via_iOS') {
    return process.env.APPLE_IOS_APP_BUNDLE_ID;
  }

  if (type === 'watchOS') {
    return process.env.APPLE_WATCHOS_APP_BUNDLE_ID;
  }

  return null;
};

const createNewUtteranceMessageForApple = (languageCode = '', type = 'iOS') => {
  const isJapanese = languageCode.startsWith('ja-');

  if (isJapanese) {
    const base = '参加しているトークに新しい発話がありました。';
    if (type === 'watchOS' || type === 'watchOS_via_iOS') {
      return `Apple Watchで${base}`;
    }
    return base;
  }

  if (type === 'watchOS' || type === 'watchOS_via_iOS') {
    return 'New utterances are available on Apple Watch.';
  }

  return 'Your joined talks have new messages.';
};

const createAndroidNotification = (languageCode = '') => {
  const isJapanese = languageCode.startsWith('ja-');

  if (isJapanese) {
    return {
      title: 'UDトーク',
      body: '参加しているトークに新しい発話がありました。',
    };
  }

  return {
    title: 'UDTalk',
    body: 'Your joined talks have new messages.',
  };
};

router.post(
  '/registerDevice',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const { userId, talkId } = req.body;
    const deviceToken = (req.body.deviceToken || '').trim();

    if (!userId || !talkId) {
      return next(createError(400, 'userId and talkId are required'));
    }

    const devicePayload = buildPayload(req.body, {
      deviceToken,
      timestamp: Date.now(),
      lastPublishTimestamp: 0,
    });

    if (!deviceToken) {
      return res.json({ result: true });
    }

    const talkDoc = firestore.collection('talks').doc(talkId);
    const userDoc = talkDoc.collection('users').doc(userId);

    await runWithFirestoreTimeout(
      res,
      async () => {
        const [talkSnapshot, userSnapshot] = await Promise.all([talkDoc.get(), userDoc.get()]);

        if (!talkSnapshot.exists) {
          await talkDoc.set({ userCount: 1 }, { merge: true });
        } else if (!userSnapshot.exists) {
          const talkData = talkSnapshot.data() || {};
          const userCount = Number(talkData.userCount || 0) + 1;
          await talkDoc.set({ userCount }, { merge: true });
        }

        await userDoc.set(devicePayload);
      },
      'firestore_register_device',
    );

    return res.json({ result: true });
  }),
);

router.post(
  '/unregisterDevice',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const { userId, talkId } = req.body;

    if (!userId || !talkId) {
      return next(createError(400, 'userId and talkId are required'));
    }

    const talkDoc = firestore.collection('talks').doc(talkId);
    const userDoc = talkDoc.collection('users').doc(userId);

    await runWithFirestoreTimeout(
      res,
      async () => {
        const userSnapshot = await userDoc.get();
        if (!userSnapshot.exists) {
          return;
        }

        await userDoc.delete();

        const talkSnapshot = await talkDoc.get();
        if (!talkSnapshot.exists) {
          return;
        }

        const talkData = talkSnapshot.data() || {};
        const currentCount = Math.max(Number(talkData.userCount || 0) - 1, 0);

        if (currentCount === 0) {
          await talkDoc.delete();
        } else {
          await talkDoc.set({ userCount: currentCount }, { merge: true });
        }
      },
      'firestore_unregister_device',
    );

    return res.json({ result: true });
  }),
);

router.post(
  '/updateDeviceStatus',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const { userId, talkId } = req.body;

    if (!userId || !talkId) {
      return next(createError(400, 'userId and talkId are required'));
    }

    const updates = buildPayload(req.body, {
      timestamp: Date.now(),
    });

    const talkDoc = firestore.collection('talks').doc(talkId);
    const userDoc = talkDoc.collection('users').doc(userId);

    await runWithFirestoreTimeout(
      res,
      async () => {
        const userSnapshot = await userDoc.get();
        if (!userSnapshot.exists) {
          return;
        }

        await userDoc.update(updates);
      },
      'firestore_update_device_status',
    );

    return res.json({ result: true });
  }),
);

router.post(
  '/pushNewUtteranceNotification',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const { userId, talkId, forcePublishing } = req.body;

    if (!userId || !talkId) {
      return next(createError(400, 'userId and talkId are required'));
    }

    const now = Date.now();
    const shouldForce = forcePublishing === '1';

    const talkDoc = firestore.collection('talks').doc(talkId);
    const usersCollection = talkDoc.collection('users');

    const query = shouldForce
      ? usersCollection
      : usersCollection
          .where('timestamp', '<=', now - HEARTBEAT_THRESHOLD_MS)
          .where('timestamp', '>=', now - ACTIVE_WINDOW_MS);

    const usersSnapshot = await runWithFirestoreTimeout(
      res,
      () => query.get(),
      'firestore_get_push_targets',
    );

    const tasks = [];
    const signal = res.locals.abortSignal;

    for (const userSnapshot of usersSnapshot.docs) {
      const userData = userSnapshot.data();
      if (!userData) {
        continue;
      }

      if (userData.userId === userId) {
        continue;
      }

      const lastPublishTimestamp = Number(userData.lastPublishTimestamp || 0);
      const isEligible = shouldForce || lastPublishTimestamp <= now - MIN_PUBLISH_INTERVAL_MS;

      if (!isEligible) {
        continue;
      }

      const deviceToken = (userData.deviceToken || '').trim();
      if (!deviceToken) {
        continue;
      }

      if (userData.type === 'Android') {
        const notification = createAndroidNotification(userData.languageCode || '');
        tasks.push(
          sendFirebasePush({
            deviceToken,
            title: notification.title,
            body: notification.body,
            signal,
          }),
        );
      } else if (userData.type === 'iOS' || userData.type === 'watchOS' || userData.type === 'watchOS_via_iOS') {
        const bundleId = getAppleBundleId(userData.type);

        if (!bundleId) {
          continue;
        }

        tasks.push(
          sendApplePush({
            deviceToken,
            production: userData.env === 'pro',
            bundleId,
            message: createNewUtteranceMessageForApple(userData.languageCode || '', userData.type),
            signal,
          }),
        );
      }

      if (!shouldForce) {
        const userDoc = usersCollection.doc(userSnapshot.id);
        tasks.push(
          runWithFirestoreTimeout(
            res,
            () => userDoc.update({ lastPublishTimestamp: now }),
            'firestore_update_last_publish',
          ),
        );
      }
    }

    await Promise.all(tasks);

    return res.json({ result: true });
  }),
);

router.post(
  '/deleteUnusedDevices',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const now = Date.now();
    const talksCollection = firestore.collection('talks');

    const talksSnapshot = await runWithFirestoreTimeout(
      res,
      () => talksCollection.get(),
      'firestore_get_talks_for_cleanup',
    );

    for (const talkSnapshot of talksSnapshot.docs) {
      const talkDoc = talksCollection.doc(talkSnapshot.id);
      const usersCollection = talkDoc.collection('users');

      const usersSnapshot = await runWithFirestoreTimeout(
        res,
        () => usersCollection.get(),
        'firestore_get_users_for_cleanup',
      );

      let activeDeviceCount = 0;
      const deletionTasks = [];

      for (const userSnapshot of usersSnapshot.docs) {
        const userData = userSnapshot.data();
        if (!userData) {
          continue;
        }

        if (now - ACTIVE_WINDOW_MS > Number(userData.timestamp || 0)) {
          const userDoc = usersCollection.doc(userSnapshot.id);
          deletionTasks.push(
            runWithFirestoreTimeout(
              res,
              () => userDoc.delete(),
              'firestore_delete_inactive_device',
            ),
          );
        } else {
          activeDeviceCount += 1;
        }
      }

      await Promise.all(deletionTasks);

      const previousCount = Number((talkSnapshot.data() || {}).userCount || 0);

      if (activeDeviceCount <= 0) {
        await runWithFirestoreTimeout(
          res,
          () => talkDoc.delete(),
          'firestore_delete_empty_talk',
        );
      } else if (previousCount !== activeDeviceCount) {
        await runWithFirestoreTimeout(
          res,
          () => talkDoc.set({ userCount: activeDeviceCount }, { merge: true }),
          'firestore_update_active_count',
        );
      }
    }

    return res.json({ result: true });
  }),
);

router.post(
  '/pushRemoteNotificationDirectly',
  wrap(async (req, res, next) => {
    ensureApiKey(req);

    const { deviceToken, languageCode = '', type, message } = req.body;
    const signal = res.locals.abortSignal;

    if (!deviceToken || !type) {
      return next(createError(400, 'deviceToken and type are required'));
    }

    if (type === 'Android') {
      const notification = createAndroidNotification(languageCode);
      await sendFirebasePush({
        deviceToken: deviceToken.trim(),
        title: notification.title,
        body: message || notification.body,
        signal,
      });
    } else if (type === 'iOS' || type === 'watchOS' || type === 'watchOS_via_iOS') {
      const bundleId = getAppleBundleId(type);

      if (!bundleId) {
        return next(createError(400, 'Unsupported Apple bundle type'));
      }

      await sendApplePush({
        deviceToken: deviceToken.trim(),
        production: true,
        bundleId,
        message: message || createNewUtteranceMessageForApple(languageCode, type),
        signal,
      });
    } else {
      return next(createError(400, 'Unsupported device type'));
    }

    return res.json({ result: true });
  }),
);

module.exports = router;
