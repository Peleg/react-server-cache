const Memcached = require('memcached');
const CacheStore = require('./CacheStore');

module.exports = class MemcachedCacheStore extends CacheStore {
  // TODO implement
  // all calls to 'get' can safely be deferred until next tick so we can use a multiget

  constructor(opts = {}) {
    super(opts);

    const location = opts.location || 'localhost:11211';
    this.memcached = new Memcached(location);

    this._getsQueue = [];
    this._isGetScheduled = false;
  }

  multiGet(key) {
    this.memcached.getMulti(this._getsQueue, (err, data) => {

    });
  }

  get(key) {
    return new Promise((res, rej) => {
      this._getsQueue.push(key);
      if (!this._isGetScheduled) {
        process.nextTick(() => {
          this.multiGet().then((data) => {
            if (data[key]) {
              res(data[key]);
              return;
            }
            rej();
          }).catch(rej);
          this._isGetScheduled = false;
          this._getsQueue = [];
        });
        this._isGetScheduled = true;
      }
    });
  }

  set(key, value) {
    return new Promise((res, rej) => {
      this.memcached.set(key, value);
    });
  }
};
