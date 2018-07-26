# test-server

Spife has a test server utility that can make writing tests easy.

The test server has all the same middleware hooks as a normal server, as well as two additional ones that may be useful for testing.

- `processSuite(suite, next)`: Handle an entire test process — the lifetime of the test server.
- `processTestcase(suite, testfn, args, next)`: Handle a single test case, e.g. when `suite.isolate()` is called.

Indicate to your test framework that you want to run a handler as a spife test:

```javascript
const createTestServer = require('@npm/spife/utils/test-server')
const suite = createTestServer(require.resolve('../lib/path/to/your/settings'))
const tap = require('tap')

tap.test('hello', suite.isolate(async assert => {
  // hooked into spife!
  suite.intercept(req => { // useful for mocking things added by middleware
    req.apiClient = {
      get: async () => ({message: 'hello'})
    }
  })
  const resp = await suite.request({
    method: "GET",
    url: '/v1/hello'
  })
  assert.equal(resp.statusCode, 200)
  assert.equal(resp.payload, 'hello')
}))
```

```javascript
// or with mocha...
const createTestServer = require('@npm/spife/utils/test-server')
const {assert} = require('chai')

describe('hello', () => {
  const suite = createTestServer(require.resolve('../lib/path/to/your/settings'))

  it('should say hello', suite.isolate(async assert => {
    suite.intercept(req => { // useful for mocking things added by middleware
      req.apiClient = {
        get: async () => ({message: 'hello'})
      }
    })
    const resp = await suite.request({
      method: "GET",
      url: '/v1/hello'
    })
    assert.equal(resp.statusCode, 200)
    assert.equal(resp.payload, 'hello')
  }))
})


```

To start, the following test middleware has been made available:

- `test-inject-request` — exposes `suite.request({method, url, payload})`, using shot.
- `test-request-interceptor` — exposes `suite.intercept(req => {})`, to allow for adding props to the request object as it comes through.
- `test-database` — runs the isolate in a transaction, and each request in an atomic checkpoint.

The request interceptor, injector, and json body parsing middleware **are enabled by default**. The application's configured middleware is **ignored**. You may specify middleware (or override the router) by passing `{middleware, router}` options:

```javascript
const suite = createTestServer(require.resolve('../lib/path/to/settings'), {
  middleware: [
    '@npm/spife/foo',
    ['@npm/spife/middleware/test-database', {}],
    { // inline middleware
      async processSuite (suite, next) {
        await setupDB()
        await next(suite)
      }
      async processTestcase (suite, testfn, args, next) {
        await startDBTransaction()
        await next(suite, testfn, args)
        await rollbackDBTransaction()
      }
    }
  ]
})
```
