const createError = require('http-errors');
const { APP_REQUEST_TIMEOUT_MS } = require('../config/timeouts');

module.exports = function requestTimeout(req, res, next) {
  if (!APP_REQUEST_TIMEOUT_MS) {
    return next();
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (controller) {
    req.abortController = controller;
    res.locals.abortSignal = controller.signal;
  }

  const timeoutAt = Date.now() + APP_REQUEST_TIMEOUT_MS;
  res.locals.requestTimeoutAt = timeoutAt;

  const timer = setTimeout(() => {
    if (controller) {
      controller.abort();
    }

    if (res.headersSent) {
      return;
    }

    const err = createError(504, 'Request timed out');
    err.code = 'request_timeout';
    err.expose = true;
    next(err);
  }, APP_REQUEST_TIMEOUT_MS);

  const clear = () => {
    clearTimeout(timer);
    req.removeListener('close', clear);
    res.removeListener('finish', clear);
  };

  req.on('close', clear);
  res.on('finish', clear);

  next();
};
