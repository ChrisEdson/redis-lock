"use strict";

async function acquireLock(
  client,
  lockName,
  timeout,
  shouldRetry,
  retryDelay,
  onLockAcquired
) {
  function retry() {
    setTimeout(function () {
      acquireLock(
        client,
        lockName,
        timeout,
        shouldRetry,
        retryDelay,
        onLockAcquired
      );
    }, retryDelay);
  }

  var lockTimeoutValue = Date.now() + timeout + 1;

  try {
    const result = await client.set(lockName, lockTimeoutValue, {
      PX: timeout,
      NX: true,
    });

    if (result === null && shouldRetry) {
      retry();
      return;
    }
    onLockAcquired(lockTimeoutValue);
  } catch (err) {
    if (shouldRetry) {
      retry();
    }
  }
}

module.exports = function (client, retryDelay) {
  if (!(client && client.set)) {
    throw new Error("You must specify a client instance of Node Redis");
  }

  retryDelay = retryDelay || 50;

  return function (lockName, options, taskToPerform) {
    if (!lockName) {
      throw new Error(
        "You must specify a lock string. It is on the redis key `lock.[string]` that the lock is acquired."
      );
    }

    // No options passed
    if (typeof taskToPerform === "undefined") {
      if (typeof options !== "function") {
        throw new Error("Callback should be a function");
      }

      taskToPerform = options;
      options = {
        timeout: 5000,
        shouldRetry: true,
      };
    } else if (typeof options !== "object") {
      throw new Error("Options passed should be an object.");
    } else if (typeof taskToPerform !== "function") {
      throw new Error("Callback should be a function");
    }

    var timeout = options.timeout || 5000;
    var shouldRetry =
      typeof options.shouldRetry === "undefined" ? true : options.shouldRetry;

    lockName = "lock." + lockName;

    acquireLock(
      client,
      lockName,
      timeout,
      shouldRetry,
      retryDelay,
      function (lockTimeoutValue) {
        taskToPerform(async function (done) {
          done = done || function () {};

          if (lockTimeoutValue > Date.now()) {
            await client.del(lockName);
            done();
          } else {
            done();
          }
        });
      }
    );
  };
};
