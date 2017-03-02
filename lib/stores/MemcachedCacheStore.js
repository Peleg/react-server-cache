const Memcached = require('memcached');
const CacheStore = require('./CacheStore');

module.exports = class MemcachedCacheStore extends CacheStore {
  constructor(opts = {}) {
    super(opts);

    const location = opts.location || 'localhost:11211';
    this.memcached = new Memcached(location);

    this.cacheKeyPrefix = opts.cacheKeyPrefix;
    this.defaultTtlInSeconds = opts.defaultTtlInSeconds || 10 * 60;

    this._queuedKeys = [];
    this._scheduledMultiGet;
  }

  _toCacheKey(key) {
    return this.cacheKeyPrefix ?
      `${this.cacheKeyPrefix}:${key}` :
      key;
  }

  _get(key) {
    return new Promise((res, rej) => {
      this.memcached.get(this._toCacheKey(key), (err, data) => {
        if (err) {
          rej(err);
          return;
        }

        if (!data) {
          rej();
          return;
        }

        res(data);
      });
    });
  }

  _multiGet(key) {
    return new Promise((res, rej) => {
      this._queuedKeys.push(this._toCacheKey(key));

      if (!this._scheduledMultiGet) {
        this._scheduledMultiGet = this._scheduleMultiGet();
      }

      this._scheduledMultiGet.then((data) => {
        if (data[key]) {
          res(data[key]);
          return;
        }
        rej();
      }).catch(rej);
    });
  }

  _scheduleMultiGet() {
    return new Promise((res, rej) => {
      process.nextTick(() => {
        this.memcached.getMulti(this._queuedKeys, (err, data) => {
          process.nextTick(() => {
            this._queuedKeys = [];
            this._scheduledMultiGet = null;
          });

          if (err) {
            rej(err);
            return;
          }

          res(data);
        });
      });
    });
  }

  /**
   * if @param force is set to true, we trigger an immediate get. otherwise, we
   * queue the keys so they can be retrieved in next tick
   */
  get(key, force = false) {
    return new Promise((res, rej) => {
      if (force) {
        return this._get(key).then(res, rej);
      }
      return this._multiGet(key).then(res, rej);
    });
  }

  set(key, value, ttlInSeconds) {
    ttlInSeconds = typeof ttlInSeconds === 'number' ?
      ttlInSeconds :
      this.defaultTtlInSeconds;
    return new Promise((res, rej) => {
      this.memcached.set(this._toCacheKey(key), value, ttlInSeconds, (err) => {
        if (err) {
          rej(err);
          return;
        }
        res();
      });
    });
  }
};
