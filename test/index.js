
const assert = require('assert');
const React = require('react');
const crypto = require('crypto');

// Must be required before
const rsc = require('../');
const MemcachedStore = require('../lib/stores/MemcachedCacheStore');
const ReactCompositeComponent = require('react-dom/lib/ReactCompositeComponent');
const ReactDOMServer = require('react-dom/server');

const CachedDemoComp = rsc.cachedComponent()(function CachedDemoComp(props) {
  return React.createElement('div', props, [
    React.createElement('div', { key: 1 }, 'STRING A'),
    React.createElement('div', { key: 2 }, 'STRING B')
  ]);
});

const reactTree = React.createElement('div', { id: 'not-cached-1' }, [
  React.createElement('div', { key: 1, id: 'not-cached-2' }, [
    React.createElement('span', { key: 1, id: 'not-cached-3' }),
    React.createElement(CachedDemoComp, { key: 2, id: 'cached-1' }),
    React.createElement(CachedDemoComp, { key: 3, id: 'not-cached-4' }, [
      React.createElement(CachedDemoComp, { key: 1, id: 'not-cached-5' }),
    ]),
    React.createElement('span', { key: 4, id: 'not-cached-6' })
  ]),
  React.createElement('div', { key: 2, id: 'not-cached-7' }, [
    React.createElement('span', { key: 1, id: 'not-cached-8' })
  ]),
  React.createElement(CachedDemoComp, { key: 3, id: 'cached-3' }),
]);

describe('react-server-cache', () => {
  before(() => {
    process.env._NODE_ENV = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  after(() => {
    process.env.NODE_ENV = process.env._NODE_ENV;
    delete process.env._NODE_ENV;
  });

  describe('setup', () => {
    it('monkey patches ReactCompositeComponent.mountComponent', () => {
      assert(ReactCompositeComponent.mountComponent.name === 'mountComponentFromCache');
    });

    it('only checks for cached components when enabled');
    it('only caches components when enabled');
    it('allows to set a custom store');
  });

  describe('rendering when enabled', () => {
    let tempMarkup;

    beforeEach(() => {
      rsc.enableCache();
      tempMarkup = ReactDOMServer.renderToString(reactTree);
    });

    afterEach(() => {
      rsc.rewind();
      rsc.disableCache();
    });

    describe('rendering the tree', () => {
      it('returns a placeholder markup when comp could be cached', () => {
        assert(tempMarkup.includes('<!-- cache:CachedDemoComp'));
      });

      it('returns the real comp when it cannot be cached', () => {
        assert(tempMarkup.includes('<div id="not-cached-1"'));
      });

      it('aggregates cache promises', () => {
        assert(rsc.rewind().length === 2);
      });
    });

    describe('calling rewind', () => {
      it('clears aggregated cache promises', () => {
        rsc.rewind();
        assert(rsc.rewind().length === 0);
      });

      it('returns the cache promises', () => {
        assert(typeof rsc.rewind()[0].then === 'function');
      });

      it('resolves with the real markup', () => {
        return rsc.rewind()[0].then(({ markup }) => {
          assert(markup.includes('<div id="cached-1"'));
        });
      });

      it('resolves with the key so it can be replaced w real markup', () => {
        return rsc.rewind()[0].then(({ cacheKey }) => {
          const hashedKey = crypto
            .createHash('md5')
            .update('{"id":"cached-1"}')
            .digest('hex');
          assert(cacheKey === `CachedDemoComp:${hashedKey}`);
        });
      });
    });

    describe('react comp mgmt', () => {
      it('computes the correct react-ids after retrieved from cache', () => {
        return rsc.replaceWithCachedValues(tempMarkup).then((finalMarkup) => {
          const regex = /data-reactid="(\d+?)"/g;
          let match;
          let counter = 1;
          while (match = regex.exec(finalMarkup)) {
            const [, reactId] = match;
            assert(Number(reactId) === counter);
            counter++;
          }
        });
      });

      it('computes the corrent checksum', () => {
        const checksumRegex = /data-react-checksum="(-?\d+)"/;
        return rsc.replaceWithCachedValues(tempMarkup).then((cachedMarkup) => {
          rsc.disableCache();
          const nonCachedMarkup = ReactDOMServer.renderToString(reactTree);

          const [, cachedChecksum] = cachedMarkup.match(checksumRegex);
          const [, nonCachedChecksum] = nonCachedMarkup.match(checksumRegex);

          assert(nonCachedChecksum === cachedChecksum);
        });
      });
    });

    describe('cache stores', () => {
      describe('memcached', () => {
        let store;

        beforeEach(() => {
          store = new MemcachedStore();
          store.memcached.getMulti = function getMultiSpy(keys, cb) {
            store.memcached.getMulti._calls.push(keys);
            cb(undefined, {});
          };
          store.memcached.getMulti._calls = [];
          rsc.setStore(store);
        });

        it('uses one multiget for all cache fetches', () => {
          tempMarkup = ReactDOMServer.renderToString(reactTree);
          return rsc.replaceWithCachedValues(tempMarkup).then((cachedMarkup) => {
            assert(store.memcached.getMulti._calls.length === 1);
            assert(Object.keys(store.memcached.getMulti._calls[0]).length === 2);
          });
        });
      });
    });
  });
});
