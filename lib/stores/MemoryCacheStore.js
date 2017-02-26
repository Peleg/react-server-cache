const CacheStore = require('./CacheStore');

module.exports = class MemoryCacheStore extends CacheStore {
  constructor() {
    super();
    this._store = new Map();
  }

  get(key) {
    return new Promise((res, rej) => {
      this._store.has(key)
        ? res(this._store.get(key))
        : rej();
    });
  }

  set(key, value) {
    return new Promise((res, rej) => {
      this._store.set(key, value)
      res(value);
    });
  }
};
