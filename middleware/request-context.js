const { randomUUID } = require('crypto');

module.exports = function requestContext(req, res, next) {
  const traceId = typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}-${Math.random()}`;

  req.traceId = traceId;
  res.locals.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);

  const startedAt = Date.now();
  res.locals.requestStartedAt = startedAt;

  const cleanup = () => {
    res.removeListener('finish', cleanup);
    res.removeListener('close', cleanup);
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);

  next();
};
