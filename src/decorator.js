const React = require('react');
const ExecutionEnvironment = require('exenv');

module.exports.cachedComponent = (cacheKeyFn) => {
  function wrap(WrappedComponent) {
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

    const wrappedComponentName =
      WrappedComponent.displayName ||
      WrappedComponent.name ||
      'Component';

    CachedComponent.cacheKeyFn = cacheKeyFn || JSON.stringify;
    CachedComponent.canCache = true;
    CachedComponent.wrappedComponentName = wrappedComponentName;
    CachedComponent.displayName = `CachedComponent(${wrappedComponentName})`;

    return CachedComponent;
  }

  // no cacheKeyFn given
  if (cacheKeyFn && typeof cacheKeyFn.type === 'function') { // react comp
    const WrappedComp = cacheKeyFn;
    cacheKeyFn = undefined;
    return wrap(WrappedComp);
  }

  return wrap;
};

