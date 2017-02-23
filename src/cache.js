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

let isEnabled = false;
let cacheStore = new MemoryCacheStore();
let cachePromises = [];

function enable() {
  assert(
    process.env.NODE_ENV === 'production',
    'React-Server-Cache must run in NODE_ENV production only'
  );
  isEnabled = true;
};

function disable() {
  isEnabled = false;
};

function setStore(store) {
  cacheStore = store;
};

// must call rewind after rendering on server (in same tick). otherwise we got a mem leak.
// TODO: find a better interface for this?
function rewind() {
  const _cachePromises = cachePromises;
  cachePromises = [];
  return _cachePromises;
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

function replaceWithCachedValues(markup) {
  return Promise.all(rewind()).then((cachedValues) => {

    const cacheMap = {};
    let regex = '';

    cachedValues.forEach(({ key, html }, idx) => {
      const placeholderMarkup = `<!-- cache:${key} -->`;
      idx !== 0 && (regex += '|');
      regex += placeholderMarkup;
      cacheMap[placeholderMarkup] = html;
    });

    markup = markup.replace(new RegExp(`(${regex})`, 'g'), (m) => cacheMap[m]);

    return markup;
  });
};

module.exports.enable = enable;
module.exports.disable = disable;
module.exports.setStore = setStore;
module.exports.rewind = rewind;
module.exports.replaceWithCachedValues = replaceWithCachedValues;
