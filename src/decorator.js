const React = require('react');
const ExecutionEnvironment = require('exenv');

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

