const React = require('react');
const ExecutionEnvironment = require('exenv');

module.exports = function cachedComponent(cacheKeyFn, opts = {}) {
  return function wrap(WrappedComponent) {
    if (ExecutionEnvironment.canUseDOM) {
      return WrappedComponent;
    }

    function CachedComponent(props) {
      return React.createElement(WrappedComponent, props);
    }

    const wrappedComponentName =
      WrappedComponent.displayName ||
      WrappedComponent.name ||
      'Component';

    CachedComponent.cacheKeyFn = cacheKeyFn || JSON.stringify;
    CachedComponent.canCache = true;
    CachedComponent.cacheTtlInSeconds = opts.cacheTtlInSeconds;
    CachedComponent.wrappedComponentName = wrappedComponentName;
    CachedComponent.displayName = 'CachedComponent(' + wrappedComponentName + ')';

    return CachedComponent;
  };
};
