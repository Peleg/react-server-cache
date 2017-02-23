const assert = require('assert');

assert(
  !require.cache[require.resolve('react-dom/lib/ReactCompositeComponent')],
  'React-server-cache must be required before ReactCompositeComponent'
);

const React = require('react');
const ReactCompositeComponent = require('react-dom/lib/ReactCompositeComponent');
const DOMPropertyOperations = require('react-dom/lib/DOMPropertyOperations');
const ExecutionEnvironment = require('exenv');
const _ = require('lodash');

let isEnabled = false;

let cacheStore = {
  _store: {},
  get(key) {
    return new Promise((res, rej) => {
      key in this._store
        ? res(this._store[key])
        : rej();
    });
  },
  set(key, value) {
    return new Promise((res, rej) => {
      this._store[key] = value;
      res(value);
    });
  }
};

module.exports.enable = function enable() {
  assert(
    process.env.NODE_ENV === 'production',
    'React-Server-Cache must run in NODE_ENV production only'
  );
  isEnabled = true;
};

module.exports.disable = function disable() {
  isEnabled = false;
};

// must call rewind after rendering on server (in same tick). otherwise we got a mem leak.
// TODO: find a better interface for this?
let cachePromises = [];
module.exports.rewind = function rewind() {
  const _cachePromises = cachePromises;
  cachePromises = [];
  return _cachePromises;
};

module.exports.setStore = function setStore(store) {
  assert(typeof store.get === 'function', 'cache store must implement a `get` method');
  assert(typeof store.set === 'function', 'cache store must implement a `set` method');
  cacheStore = store;
};

const MARKUP_FOR_ROOT = DOMPropertyOperations.createMarkupForRoot();
const REACT_ID_REPLACE_REGEX = new RegExp('(data-reactid="|react-text: )[0-9]*', 'g');

function addRootMarkup(html) {
  return html.replace(/(<[^ >]*)([ >])/, (m, a, b) =>
    `${a} ${MARKUP_FOR_ROOT}${b}`
  );
}

function updateReactId(html, hostContainerInfo) { // eslint-disable-line
  let id = hostContainerInfo._idCounter;
  html = html.replace(REACT_ID_REPLACE_REGEX, (m, a) => `${a}${id++}`);
  hostContainerInfo._idCounter = id;
  return html;
}

const _originalMountComponent = ReactCompositeComponent.mountComponent;

ReactCompositeComponent.mountComponent = function mountComponentFromCache(
  transaction,
  hostParent,
  hostContainerInfo
) {
  const _originalArgs = arguments;

  const currentElement = this._currentElement;

  const currentProps = currentElement.props;

  const canCache =
    typeof currentElement.type !== 'string' && // not HTML element
    currentElement.type.canCache && // component was wrapped in CachedComponent
    !transaction._cached && // component's parent isn't already cached
    !_.isEmpty(currentProps) && // TODO: why dont we want to cache propless comps?
    typeof currentProps.children !== 'object';

  if (!isEnabled || !canCache) {
    return _originalMountComponent.apply(this, _originalArgs);
  }

  const currentName = currentElement.type.wrappedComponentName;

  const key = `${currentName}:${currentElement.type.cacheKeyFn(currentProps)}`; // TODO: hash

  cachePromises.push(cacheStore.get(key)
    .catch((e) => {
      if (e) { return Promise.reject(e); }

      // so we dont cache children separately
      transaction._cached = currentName;
      // real react-id will have to be determined when cache is fetched
      const currentIdCounter = hostContainerInfo._idCounter;
      hostContainerInfo._idCounter = 1;

      const html = _originalMountComponent.apply(this, _originalArgs);

      transaction._cached = undefined;
      hostContainerInfo._idCounter = currentIdCounter;

      cacheStore.set(key, html);
      return html;
    })
    .then((html) => {
      if (!transaction.renderToStaticMarkup) {
        html = updateReactId(html, hostContainerInfo);
      }

      if (!hostParent) {
        html = addRootMarkup(html);
      }

      return { key, html };
    })
  );

  return `<!-- cache:${key} -->`;
};

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component';
}

module.exports.cachedComponent = (cacheKeyFn) => {
  return (WrappedComponent) => {
    if (ExecutionEnvironment.canUseDOM) {
      return WrappedComponent;
    }

    class CachedComponent extends React.Component {
      constructor(...args) {
        super(...args);
        this.setState = function cachedComponentSetState(partialState) {
          return Object.assign({}, this.state, partialState);
        };
      }

      render() {
        return React.createElement(WrappedComponent, this.props);
      }
    }

    CachedComponent.cacheKeyFn = cacheKeyFn || JSON.stringify;
    CachedComponent.canCache = true;
    CachedComponent.wrappedComponentName = getDisplayName(WrappedComponent);
    CachedComponent.displayName = `CachedComponent(${getDisplayName(WrappedComponent)})`;

    return CachedComponent;
  };
};
