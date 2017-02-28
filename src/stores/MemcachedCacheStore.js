const CacheStore = require('./CacheStore');
const _ = require('lodash');

module.exports = class MemcachedCacheStore extends CacheStore {
  // TODO implement
  // all calls to 'get' can safely be deferred until next tick so we can use a multiget
  constructor (memcached) {
    super();
    this.memcached = memcached;
    this.queuedGets = {};
  }

  get (key) {
    return this.enqueueGet(key);
  }

  enqueueGet(key) {
    const onFetch = new Promise((resolve, reject) => {
      if (Object.keys(this.queuedGets).length === 0) {
        process.nextTick(this.executeMulti.bind(this));
      }
      if (!this.queuedGets[key]) {
        this.queuedGets[key] = { resolves: [], rejects: [] };
      }
      this.queuedGets[key].resolves.push(resolve);
      this.queuedGets[key].rejects.push(reject);
    });
    return onFetch;
  }

  executeMulti() {
    const gets = this.queuedGets;
    this.queuedGets = {};
    console.log(_.mapValues(gets, ({ key }) => key));
    this.memcached.getMulti(Object.keys(gets), (err, data) => {
      if (err) {
        _.mapValues(gets, ({ rejects }) => rejects.forEach(r => r(err)));
        return;
      }
      _.toPairs(gets).forEach(
        ([key, { resolves }]) => resolves.forEach(r => r(data[key]))
      );
    });
  }

  set (key, value, lifetime = 15 * 3600) {
    return new Promise((resolve, reject) => {
      this.memcached.set(key, value, lifetime, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
};
