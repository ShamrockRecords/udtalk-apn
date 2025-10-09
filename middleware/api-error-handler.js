const isApiRequest = (req) => req.originalUrl && req.originalUrl.startsWith('/api');

module.exports = function apiErrorHandler(err, req, res, next) {
  if (!isApiRequest(req)) {
    return next(err);
  }

  const status = Number.isInteger(err.status) ? err.status : Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const traceId = res.locals.traceId;
  const isClientError = status >= 400 && status < 500;

  const shouldExposeMessage = isClientError || err.expose;

  const payload = {
    traceId,
    code: err.code || (isClientError ? 'request_error' : 'server_error'),
    message: shouldExposeMessage ? err.message || 'Bad request' : 'Internal server error',
  };

  if (req.app.get('env') === 'development' && err.detail) {
    payload.detail = err.detail;
  }

  if (req.app.get('env') === 'development' && err.stack) {
    payload.stack = err.stack;
  }

  if (!res.headersSent) {
    res.status(status).json(payload);
  }
};
