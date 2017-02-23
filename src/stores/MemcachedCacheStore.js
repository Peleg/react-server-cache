const CacheStore = require('./CacheStore');
module.exports = class MemcachedCacheStore extends CacheStore {
  // TODO implement
  // all calls to 'get' can safely be deferred until next tick so we can use a multiget
};
