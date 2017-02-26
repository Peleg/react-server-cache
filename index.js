/* eslint-disable global-require */
module.exports = require('./lib/cache');
module.exports.CacheStore = require('./lib/stores/CacheStore');
module.exports.MemoryCacheStore = require('./lib/stores/MemoryCacheStore');
module.exports.MemcachedCacheStore = require('./lib/stores/MemcachedCacheStore');
module.exports.cachedComponent = require('./lib/decorator');
