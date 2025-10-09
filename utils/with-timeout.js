const createError = require('http-errors');

module.exports = function withTimeout(task, options = {}) {
  const { timeout, signal, label = 'operation' } = options;

  if (typeof task !== 'function') {
    throw new TypeError('withTimeout expects a function that returns a promise');
  }

  if (!timeout || timeout <= 0) {
    return Promise.resolve().then(() => task(signal));
  }

  return new Promise((resolve, reject) => {
    let finished = false;

    const onAbort = () => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();
      const err = createError(504, `${label} aborted`);
      err.code = 'operation_aborted';
      err.expose = true;
      reject(err);
    };

    const timer = setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();
      const err = createError(504, `${label} timed out after ${timeout}ms`);
      err.code = 'operation_timeout';
      err.expose = true;
      reject(err);
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    if (signal) {
      if (signal.aborted) {
        return onAbort();
      }

      signal.addEventListener('abort', onAbort);
    }

    Promise.resolve()
      .then(() => task(signal))
      .then((result) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        resolve(result);
      })
      .catch((err) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        reject(err);
      });
  });
};
