# React-Server-Cache

Async component caching for your server

### Why?

Server side rendering (SSR) React components can be slow. The more components
you render, the longer it takes React's `renderToString` to generate the final
HTML. This leads to a slower Time To First Byte (TTFB) and can adversely affect
the user's experience.

React-Server-Cache adds the ability to cache individual components' HTML so
React doesn't have to re-mount them which allows for significant time savings.

### Aren't there already caching solutions for that?

There are. [Walmart's
Electrode](https://github.com/TeachersPayTeachers/tpt-frontend/pull/1230) for
instance (the inspiration for this module) is a great caching library.
However, since React mounts its components synchronously, it needs to retrieve
cached components before continuing its traversal which limits the ability to
connect to external cache stores such as memcached or redis.

React-Server-Cache satisfies React's need to render synchronously by returning
temporary placeholders to be inserted in the markup while mounting. When cache
fetches resolve (or reject), the real markup is used to replace those
placeholders.

### Installation & Usage

```bash
$ yarn add github:peleg/react-server-cache
```

```javascript
/* Components/Product.jsx */

import cachedComponent from 'react-server-cache/lib/decorator';

@cachedComponent((props) => `${props.id}:${props.lastUpdated}`)
class Product extends Component {
  render() {
    return (
      <div>{ this.props.title }</div>
    );
  }
}

export default Product;
```

```javascript
/* server.js */

import { MemcachedCacheStore, createServerCache } from 'react-server-cache';
import { renderToString } from 'react-dom/server';
import Product from './Components/Product.jsx';

const cacheStore = new MemcachedCacheStore({
  location: 'localhost:11211'
});

app.get('/products/:id', (req, res) => {
  const replaceWithCachedValues = createServerCache(cacheStore);

  const tempMarkup = renderToString(<Product id={ req.params.id }>);

  replaceWithCachedValues(tempMarkup).then((finalMarkup) => {
    res.send(finalMarkup);
  });
});
```

