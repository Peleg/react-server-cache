const mc = require('../src/stores/MemcachedCacheStore');
const $m = new (require('memcached'))('127.0.0.1:11211');
const m = new mc($m);

m.set('foo', 'bar').then(() => {
  m.get('foo').then(console.log.bind(console));
  m.get('foo').then(console.log.bind(console));
});
