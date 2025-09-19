const MyPromise = require(".");

function resolved(value) {
  return MyPromise.resolve(value);
}

function rejected(reason) {
  return MyPromise.reject(reason);
}

function deferred() {
  return MyPromise.withResolvers();
}

module.exports = {
  resolved,
  rejected,
  deferred,
};
