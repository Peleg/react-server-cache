const assert = require('assert');
const _ = require('lodash');
const MemoryCacheStore = require('./stores/MemoryCacheStore');

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

let isEnabled = false;
let cacheStore = new MemoryCacheStore();
let cachePromises = [];

function enable() {
  assert(
    process.env.NODE_ENV === 'production',
    'React-Server-Cache must run in NODE_ENV production only'
  );
  isEnabled = true;
}

function disable() {
  isEnabled = false;
}

function setStore(store) {
  cacheStore = store;
}

// must call rewind after rendering on server (in same tick). otherwise we got a mem leak.
// TODO: find a better interface for this?
function rewind() {
  const _cachePromises = cachePromises;
  cachePromises = [];
  return _cachePromises;
}

const MARKUP_FOR_ROOT = DOMPropertyOperations.createMarkupForRoot();
const REACT_ID_REPLACE_REGEX = /(data-reactid="|react-text: )[0-9]*/g;
const REACT_CHECKSUM_REPLACE_REGEX = / data-react-checksum=".+?"/;

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

ReactCompositeComponent.mountComponent = function mountComponentFromCache(
  transaction,
  hostParent
) {
  const _originalArgs = arguments;
  const currentElement = this._currentElement;
  const currentProps = currentElement.props;

  const canCache =
    typeof currentElement.type !== 'string' && // not HTML element
    currentElement.type.canCache && // component was wrapped in CachedComponent
    !transaction._cached && // component's parent isn't already cached
    !_.isEmpty(currentProps) && // TODO: why dont we want to cache propless comps?
    typeof currentProps.children !== 'object' &&
    hostParent; // dont cache root comps

  if (!isEnabled || !canCache) {
    return _originalMountComponent.apply(this, _originalArgs);
  }

  const currentName = currentElement.type.wrappedComponentName;

  const cacheKey =
    `${currentName}:${currentElement.type.cacheKeyFn(currentProps)}`; // TODO: hash

  const cachePromise = cacheStore.get(cacheKey).catch((e) => {
    if (e) { return Promise.reject(e); }

    // so we dont cache children separately
    transaction._cached = currentName;
    const markup = _originalMountComponent.apply(this, _originalArgs);
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

module.exports.enable = enable;
module.exports.disable = disable;
module.exports.setStore = setStore;
module.exports.rewind = rewind;
module.exports.replaceWithCachedValues = replaceWithCachedValues;
