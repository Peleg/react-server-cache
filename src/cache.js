const assert = require('assert');
const _ = require('lodash');
const crypto = require('crypto');
const CacheStore = require('./stores/MemoryCacheStore');
const MemoryCacheStore = require('./stores/MemoryCacheStore');
const Component = require('react').Component;

assert(
  !require.cache[require.resolve('react-dom/server')],
  'React-server-cache must be required before react-dom/server'
);

assert(
  !require.cache[require.resolve('react-dom/lib/ReactCompositeComponent')],
  'React-server-cache must be required before ReactCompositeComponent'
);

const ReactCompositeComponent = require('react-dom/lib/ReactCompositeComponent');
const DOMPropertyOperations = require('react-dom/lib/DOMPropertyOperations');
const ReactMarkupChecksum = require('react-dom/lib/ReactMarkupChecksum');

const REACT_ID_REPLACE_REGEX = /(data-reactid="|react-text: )[0-9]*/g;
const REACT_CHECKSUM_REPLACE_REGEX = / data-react-checksum=".+?"/;

let isEnabled = false;
let cachePromises = [];
let cacheStore;

function setStore(store) {
  assert(store instanceof CacheStore, 'Cache store must be an instance of CacheStore');
  cacheStore = store;
}

function enableCache(store) {
  assert(
    process.env.NODE_ENV === 'production',
    'React-Server-Cache must run in NODE_ENV production only'
  );
  setStore(store || new MemoryCacheStore());
  isEnabled = true;
}

function disableCache() {
  cachePromises = [];
  cacheStore = null;
  isEnabled = false;
}

// must call rewind after rendering on server (in same tick). otherwise we got a mem leak.
// TODO: find a better interface for this?
function rewind() {
  const _cachePromises = cachePromises;
  cachePromises = [];
  return _cachePromises;
}

function updateReactIds(markup) {
  let id = 1;
  markup = markup.replace(REACT_ID_REPLACE_REGEX, (m, a) => `${a}${id++}`);
  return markup;
}

function updateChecksum(markup) {
  markup = markup.replace(REACT_CHECKSUM_REPLACE_REGEX, '');
  return ReactMarkupChecksum.addChecksumToMarkup(markup);
}

function replaceWithCachedValues(html) {
  return Promise.all(rewind()).then((cachedValues) => {
    const cacheMap = {};
    let regex = '';

    cachedValues.forEach(({ cacheKey, markup }, idx) => {
      const placeholderMarkup = `<!-- cache:${cacheKey} -->`;
      idx !== 0 && (regex += '|');
      regex += placeholderMarkup;
      cacheMap[placeholderMarkup] = markup;
    });

    html = html.replace(new RegExp(`(${regex})`, 'g'), (m) => cacheMap[m]);
    html = updateReactIds(html);
    html = updateChecksum(html);

    return html;
  });
}

const _originalMountComponent = ReactCompositeComponent.mountComponent;
const _originalSetState = Component.prototype.setState;

ReactCompositeComponent.mountComponent = function mountComponentFromCache(
  transaction,
  hostParent
) {
  const _originalArgs = arguments;
  const currentElement = this._currentElement;
  const currentProps = currentElement.props;

  const canCache =
    isEnabled &&
    typeof currentElement.type !== 'string' && // not HTML element
    currentElement.type.canCache && // component was wrapped in CachedComponent
    !transaction._cached && // component's parent isn't already cached
    !_.isEmpty(currentProps) && // TODO: why dont we want to cache propless comps?
    typeof currentProps.children !== 'object' &&
    hostParent; // dont cache root comps

  if (!canCache) {
    return _originalMountComponent.apply(this, _originalArgs);
  }

  const currentName = currentElement.type.wrappedComponentName;

  const hashedKey = crypto
    .createHash('md5')
    .update(currentElement.type.cacheKeyFn(currentProps))
    .digest('hex');

  const cacheKey = `${currentName}:${hashedKey}`;

  const cachePromise = cacheStore.get(cacheKey).catch((e) => {
    if (e) {
      return Promise.reject(e);
    }

    // so we dont cache children separately
    transaction._cached = currentName;
    Component.prototype.setState = function simplifiedSetState(partialState) {
      this.state = Object.assign({}, this.state, partialState);
    };

    const markup = _originalMountComponent.apply(this, _originalArgs);

    Component.prototype.setState = _originalSetState;
    transaction._cached = undefined;

    cacheStore.set(cacheKey, markup);
    return markup;
  }).then((markup) => ({
    cacheKey,
    markup
  }));

  cachePromises.push(cachePromise);

  return `<!-- cache:${cacheKey} -->`;
};

module.exports.enableCache = enableCache;
module.exports.disableCache = disableCache;
module.exports.setStore = setStore;
module.exports.rewind = rewind;
module.exports.replaceWithCachedValues = replaceWithCachedValues;

