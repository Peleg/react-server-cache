
const assert = require('assert');
const React = require('react');

// Must be required before
const rsc = require('../');
const ReactCompositeComponent = require('react-dom/lib/ReactCompositeComponent');
const ReactDOMServer = require('react-dom/server');

const CachedDemoComp = rsc.cachedComponent()(function CachedDemoComp(props) {
  return React.createElement('div', props, 'some random string');
});

const ELEMENTS = {
}

describe('react-server-cache', () => {
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
      process.env.NODE_ENV = 'production';
      rsc.enable();
      tempMarkup = ReactDOMServer.renderToString(
        React.createElement('div', { id: 'not-cached-1' }, [
          React.createElement('span', { id: 'not-cached-2' }),
          React.createElement(CachedDemoComp, { id: 'cached-1' }),
          React.createElement(CachedDemoComp, { id: 'cached-2' })
        ])
      );
    });

    afterEach(() => {
      rsc.rewind();
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
        return rsc.rewind()[0].then(({ html }) => {
          assert(html.includes('<div id="cached-1"'));
        });
      });

      it('resolves with the key so it can be replaced w real markup', () => {
        return rsc.rewind()[0].then(({ key }) => {
          assert(key === 'CachedDemoComp:{"id":"cached-1"}');
        });
      });
    });

    describe('react ids', () => {
      it('computes the correct ids after retrieved from cache', () => {
        return rsc.rewind()[0].then(({ html }) => {
        });
      });
    });
  });
});
