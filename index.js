function MyPromise(executor) {
  var self = this;

  if (!(self instanceof MyPromise)) {
    throw new Error("MyPromise 必须通过 'new' 关键字作为构造函数调用");
  }

  self.state = "pending"; // 一个 `promise` 只能是以下仨状态之一: pending, fulfilled, rejected
  self.result = undefined; // result 存放 `promise` 的值或者拒因
  self.handlers = []; // 存放 then 方法的注册的回调函数

  function resolve(value) {
    resolvePromise(self, value);
  }

  function reject(reason) {
    rejectPromise(self, reason);
  }

  try {
    executor(resolve, reject);
  } catch (e) {
    reject(e);
  }
}

function isFunction(fn) {
  return typeof fn === "function";
}

function isObject(obj) {
  return typeof obj === "object" && obj !== null;
}

/**
 * 执行 `promise` 的回调函数
 * @param {MyPromise} promise
 */
function flushHandlers(promise) {
  var state = promise.state;

  if (state === "pending") return; // 保证已决状态才能执行回调

  var handlers = promise.handlers;
  var result = promise.result;

  queueMicrotask(function () {
    while (handlers.length) {
      var handler = handlers.shift(); // 取出第一个回调函数
      var onFulfilled = handler.onFulfilled;
      var onRejected = handler.onRejected;

      try {
        var cb = state === "fulfilled" ? onFulfilled : onRejected;
        var x = cb(result);
        resolvePromise(handler.promise, x);
      } catch (error) {
        rejectPromise(handler.promise, error);
      }
    }
  });
}

/**
 * MyPromise 解析过程
 * @link https://promisesaplus.com/#the-promise-resolution-procedure
 * @param {MyPromise} promise
 * @param {any} x 待处理的值
 */
function resolvePromise(promise, x) {
  if (promise.state !== "pending") return;

  if (promise === x) return rejectPromise(promise, new TypeError("循环引用")); // 循环引用

  if (x instanceof MyPromise) {
    // 这里可以逻辑其实可以直接使用 thenable 的逻辑
    return queueMicrotask(function () {
      x.then(
        function (y) {
          resolvePromise(promise, y);
        },
        function (r) {
          rejectPromise(promise, r);
        }
      );
    });
  }

  var isThenable = false;
  if (isObject(x) || isFunction(x)) {
    var then;
    try {
      then = x.then;
    } catch (error) {
      return rejectPromise(promise, error);
    }

    if (isFunction(then)) {
      isThenable = true;
      queueMicrotask(function () {
        var called = false; // 防止多次调用，多次调用只取第一次
        try {
          then.call(
            x,
            function (y) {
              if (called) return;
              called = true;
              resolvePromise(promise, y);
            },
            function (r) {
              if (called) return;
              called = true;
              rejectPromise(promise, r);
            }
          );
        } catch (error) {
          if (called) return;
          called = true;
          rejectPromise(promise, error);
        }
      });
    }
  }

  if (isThenable) return;

  promise.state = "fulfilled";
  promise.result = x;
  flushHandlers(promise);
}

function rejectPromise(promise, reason) {
  if (promise.state !== "pending") return;
  promise.state = "rejected";
  promise.result = reason;
  flushHandlers(promise);
}

MyPromise.prototype.then = function (onFulfilled, onRejected) {
  var self = this;

  if (!isFunction(onFulfilled)) {
    onFulfilled = function (value) {
      return value;
    };
  }

  if (!isFunction(onRejected)) {
    onRejected = function (reason) {
      throw reason;
    };
  }

  var promise2 = new MyPromise(function () {});

  self.handlers.push({
    onFulfilled: onFulfilled,
    onRejected: onRejected,
    promise: promise2,
  });

  flushHandlers(self);

  return promise2;
};

MyPromise.prototype.catch = function (onRejected) {
  return this.then(null, onRejected);
};

MyPromise.prototype.finally = function (callback) {
  return this.then(
    function (value) {
      return MyPromise.resolve(callback()).then(function () {
        return value;
      });
    },
    function (reason) {
      return MyPromise.resolve(callback()).then(function () {
        throw reason;
      });
    }
  );
};

MyPromise.resolve = function (value) {
  return new MyPromise(function (resolve, reject) {
    resolve(value);
  });
};

MyPromise.reject = function (reason) {
  return new MyPromise(function (resolve, reject) {
    reject(reason);
  });
};

MyPromise.all = function (promises) {
  return new MyPromise(function (resolve, reject) {
    var results = [];
    var count = 0;
    var total = promises.length;

    if (total === 0) {
      resolve(results);
    }

    for (var i = 0; i < total; i++) {
      var promise = promises[i];
      promise.then(
        function (result) {
          results[i] = result;
          count++;
          if (count === total) {
            resolve(results);
          }
        },
        function (reason) {
          reject(reason);
        }
      );
    }
  });
};

MyPromise.race = function (promises) {
  return new MyPromise(function (resolve, reject) {
    for (var i = 0; i < promises.length; i++) {
      var promise = promises[i];
      promise.then(
        function (result) {
          resolve(result);
        },
        function (reason) {
          reject(reason);
        }
      );
    }
  });
};

MyPromise.allSettled = function (promises) {
  return new MyPromise(function (resolve, reject) {
    var results = [];
    var count = 0;
    var total = promises.length;

    if (total === 0) {
      resolve(results);
    }

    for (var i = 0; i < total; i++) {
      var promise = promises[i];
      promise.then(
        function (result) {
          results[i] = { status: "fulfilled", value: result };
          count++;
          if (count === total) {
            resolve(results);
          }
        },
        function (reason) {
          results[i] = { status: "rejected", reason: reason };
          count++;
          if (count === total) {
            resolve(results);
          }
        }
      );
    }
  });
};

MyPromise.any = function (promises) {
  return new MyPromise(function (resolve, reject) {
    var reasons = [];
    var count = 0;
    var total = promises.length;

    if (total === 0) {
      reject(new Error("All promises were rejected"));
    }
    for (var i = 0; i < total; i++) {
      var promise = promises[i];
      promise.then(
        function (result) {
          resolve(result);
        },
        function (reason) {
          reasons[i] = reason;
          count++;
          if (count === total) {
            reject(new Error(reasons));
          }
        }
      );
    }
  });
};

MyPromise.try = function (cb) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new MyPromise(function (resolve, reject) {
    try {
      var result = cb.apply(null, args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
};

MyPromise.withResolvers = function () {
  var resolve, reject;
  var promise = new MyPromise(function (res, rej) {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

module.exports = MyPromise;
