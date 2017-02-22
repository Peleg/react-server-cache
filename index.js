// TODO: ?
delete require.cache[require.resolve('react-dom/lib/ReactCompositeComponent')];

const ReactCompositeComponent = require('react-dom/lib/ReactCompositeComponent');
const DOMPropertyOperations = require('react-dom/lib/DOMPropertyOperations');
const assert = require('assert');
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
  isEnabled = true;
};

module.exports.disable = function disable() {
  isEnabled = false;
};

// must call rewind after rendering on server (in same tick). otherwise we got a mem leak.
// TODO: find a better interface for this?
let cachePromises = [];
module.exports.rewind = function rewind() {
  const _cahcePromises = cachePromises;
  cachePromises = [];
  return _cachePromises;
};

module.exports.setStore = function setStore(store) {
  assert(typeof store.get === 'function', 'cache store must implement a `get` method');
  assert(typeof store.set === 'function', 'cache store must implement a `set` method');
  cacheStore = store;
}

const MARKUP_FOR_ROOT = DOMPropertyOperations.createMarkupForRoot();
const REACT_ID_REPLACE_REGEX = new RegExp(`(data-reactid="|react-text: )[0-9]*`, 'g');

function addRootMarkup(html) {
  return html.replace(/(<[^ >]*)([ >])/, (m, a, b) =>
    `${a} ${MARKUP_FOR_ROOT}${b}`
  );
};

function updateReactId(html, hostContainerInfo) { // eslint-disable-line
  let id = hostContainerInfo._idCounter;
  html = html.replace(REACT_ID_REPLACE_REGEX, (m, a) => `${a}${id++}`);
  hostContainerInfo._idCounter = id;
  return html;
};

const _originalMountComponent = ReactCompositeComponent.mountComponent;

ReactCompositeComponent.mountComponent = function mountComponentFromCache(transaction, hostParent, hostContainerInfo) {
  const currentCounter = hostContainerInfo._idCounter;

  const currentElement = this._currentElement;

  const currentProps = currentElement.props;

  const currentName =
    currentElement.type &&
    typeof currentElement.type !== 'string' &&
    currentElement.type.name;

  const canCache =
    currentElement.canCache &&
    !transaction._cached &&
    !_.isEmpty(currentProps) &&
    typeof currentProps.children !== 'object'

  if (!isEnabled || !canCache) {
    return _originalMountComponent.apply(this, arguments);
  }

  const key = `${currentName}:${currentElement.cacheKeyFn(currentProps)}`; // TODO: hash

  cachePromises.push(cacheStore.get(key)
    .catch((e) => {
      transaction._cached = currentName; // so we dont cache children separately
      hostContainerInfo._idCounter = 1; // real react-id will have to be determined when cache is fetched

      const html = _originalMountComponent.apply(this, arguments);

      transaction._cached = undefined;
      hostContainerInfo._idCounter = currentCounter;

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
    });
  );

  return `<!-- cache:${key} -->`
};

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component';
}

module.exports.cachedComponent = (cacheKeyFn) => {
  return (WrappedComponent) => {
    if (ExecutionEnvironment.canUseDOM) {
      return WrappedComponent;
    }

    return class CachedComponent extends Component {
      static displayName = `CachedComponent(${getDisplayName(WrappedComponent)})`;

      setState = function cachedComponentSetState(partialState) {
        return Object.assign({}, this.state, partialState);
      };

      cacheKeyFn = cacheKeyFn || JSON.stringify;

      canCache = true;

      render() {
        return <WrappedComponent { ...this.props } />;
      }
    }
  };
};