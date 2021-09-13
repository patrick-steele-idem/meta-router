<h1 align="center">
  <!-- Logo -->
  <br/>
  meta-router
  <br/>

  <!-- Language -->
  <a href="http://typescriptlang.org">
    <img src="https://img.shields.io/badge/%3C%2F%3E-typescript-blue.svg" alt="TypeScript"/>
  </a>
  <!-- Format -->
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with prettier"/>
  </a>
  <!-- CI -->
  <a href="https://github.com/patrick-steele-idem/meta-router/actions/workflows/ci.yml">
    <img src="https://github.com/patrick-steele-idem/meta-router/actions/workflows/ci.yml/badge.svg" alt="Build status"/>
  </a>
  <!-- Coverage -->
  <a href="https://codecov.io/gh/patrick-steele-idem/meta-router">
    <img src="https://codecov.io/gh/patrick-steele-idem/meta-router/branch/main/graph/badge.svg?token=TODO"/>
  </a>
  <!-- NPM Version -->
  <a href="https://npmjs.org/package/meta-router">
    <img src="https://img.shields.io/npm/v/meta-router.svg" alt="NPM Version"/>
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/meta-router">
    <img src="https://img.shields.io/npm/dm/meta-router.svg" alt="Downloads"/>
  </a>
</h1>

This simple, declarative, URL router provides Express middleware that can be used to associate metadata with a route. In addition, this module allows an incoming request to be matched to a route at the beginning of the request and allows the handling of the request to be deferred to later in the request. This is helpful in many applications, because intermediate middleware can use the metadata associated with the matched route to conditionally apply security checks, tracking, additional debugging, etc.

Internally, this module utilizes the same module used by Express to parse and match URLs—thus providing an easy transition from the builtin Express router to this router. The router also exposes an API that can be used independent of Express to match a path to route.

# Installation

```bash
npm install meta-router --save
```

# Problem

Let's say that you want to register authentication middleware for an application, but only a few of the routes actually require authentication. One option is to register the route-specific authentication middleware for each route using code similar to the following:

```javascript
import authMiddleware from "my-auth-middleware";
import accountPage from "./pages/account";
app.get(
  "/account" /* Route path */,
  authMiddleware({ redirect: true }) /* Route-specific middleware */,
  accountPage /* Handler: function(req, res, next) { ... } */
);
```

While the above code will work as expected, it has a few drawbacks. The extra route-specific middleware adds clutter and the resulting code is not declarative.

# Solution

To solve these problems, let's move our routes to a JSON file:

```json
[
  {
    "route": "GET /account => ./pages/account",
    "security": {
      "authenticationRequired": true,
      "redirect": true
    }
  }
]
```

By itself, the "security" metadata for the declared route will have no impact. To enforce authentication we can change the implementation of `my-auth-middleware` to be similar to the following:

```javascript
export default (req, res, next) => {
  if (req.route?.config.security?.authenticationRequired) {
    if (isUserAuthenticated(req)) {
      next();
    } else {
      // Handle un-authenticated user...
    }
  } else {
    // Route has no security policy... just continue on...
    next();
  }
};
```

Finally, to tie everything together we need to register the following middleware (order matters):

```javascript
import * as metaRouter from "meta-router";
import authMiddleware from "my-auth-middleware";
import routes from "./path/to/routes.json";

// Provide meta router with the route config.
metaRouter.configure({ routes });

// Match the incoming request to a route:
app.use(metaRouter.match());

// Apply security (if applicable)
app.use(authMiddleware);

// Invoke the route handler (if applicable)
app.use(metaRouter.invoke());
```

# Basic Usage

## Using a JSON routes file

**_routes.json:_**

```json
[
  "GET /users/:user => ./user",
  "GET /login => ./user#login",
  "GET /logout => ./user#logout",
  {
    "route": "POST /users/:user/picture => ./user#uploadPicture",
    // Below are configurations that may be picked up by other middleware in the app.
    "authenticationRequired": true,
    "uploadFileSizeLimit": "1mb"
  }
];
```

We can then consume the `routes.json` config by importing it and passing it to the `configure` api.

```javascript
import * as metaRouter from "meta-router";
import routes from "./routes.json";

// Provide meta router with the route config.
metaRouter.configure({ routes });

app.use(metaRouter.match());
// ... apply other middleware
app.use(metaRouter.invoke());
```

# API

## `configure({ routes: (Route | string)[], load?: LoadModule })`

The `configure` API is what is used to provide `meta-router` with the list of routes, meta data and `handlers`. It also allows you to override how `handlers` are loaded (by default `require`'d relative to `process.cwd()`).

### Route

The list of `routes` passed to `configure` can either be an object, or use a [shorthand string](#shorthand-route) which ultimately gets translated into the object api.

The route object supports the following properties:

```js
{
  // The express style path to match for this route.
  // This can also be a shorthand as described in the next section.
  "route": "/a",

  // The HTTP method to match or "ALL" (the default).
  "method": "GET",
  // or match multiple methods
  "methods": ["GET", "POST"],

  // A path to express route handler to run if this route matches
  "moduleId": "./user.js",
  // A method to use on the module above (by default uses main export).
  "moduleMethod": "login",
  // or pass a literal express request handler
  "handler": (req, res) => { ... },

  // Options forwarded to path-to-regexp (see https://github.com/pillarjs/path-to-regexp#usage)
  "matchOptions": {
    "sensitive": true
  }

  // Everything else is exposed as configuration that can be read
  // by all middleware via `req.route`.
  "foo": "bar",
  "security": { "authenticationRequired": true }
}
```

### Shorthand route

`meta-router` supports a shorthand form to make defining routes easy.
In the `routes` array provided to the `setRoute` api we can either pass in a `string` as a route, or an object with a `route` property that will be parsed using the shorthand rules described as follows.

`<method> <route> => <moduleId[#<moduleMethod>]>`

- The `method` should be `GET`, `POST`, etc. (If multiple needed use commas, eg `GET, POST`).
- The `route` should be an Express-style route path.
- The `moduleId` should be the path to the express request handler file, resolved from `process.cwd()` by default.
- The optional `moduleMethod` should be the name of a method on the handler module.

Here are some example strings and their [route object](#route) equivalents:

```js
"GET /user/:id => ./user#find"; /* {
  method: "GET",
  path: "/user/:id",
  moduleId: "./user",
  moduleMethod: "find"
} */

"POST, PUT /user/:id => ./user#update"; /* {
  methods: ["POST", "PUT"],
  path: "/user/:id",
  moduleId: "./user",
  moduleMethod: "update"
} */

"/user/:id => ./user"; /* {
  method: "ALL",
  path: "/user/:id",
  moduleId: "./user"
} */
```

### Custom handler loader

By default all handlers are `require`'d relative to `process.cwd()`.
You can override this behavior by passing in a `load` config option which will receive the raw `methodId` as the first argument.

```js
import path from "path";
metaRouter.configure({
  routes: ["POST /login => ./user#login"],
  async load(id) {
    // Instead of using `require`, use native esm to load the module.
    // id in this case would be "./user"`
    const module = await import(path.resolve(`${id}.js`));
    return module;
  },
});
```

This can be useful when bundling your server code using `webpack`, `vite` or similar which typically expose an api to dynamically load modules.

For `webpack` this might look like: (using https://webpack.js.org/api/module-methods/#dynamic-expressions-in-import)

```js
import path from "path";
metaRouter.configure({
  routes: ["POST /login => ./user#login"],
  async load(id) {
    return await import(`./pages/${id.slice(2)}.js`);
  },
});
```

While in `vite` it might look like: (using https://vitejs.dev/guide/features.html#glob-import)

```js
import path from "path";
const modules = import.meta.glob("./pages/*.js");
metaRouter.configure({
  routes: ["POST /login => ./user#login"],
  async load(id) {
    return modules[id];
  },
});
```

## `req.route`: using metadata associated with a matched route

After the `match` middleware runs, the matched route information is stored in the `req.route` property. The information associated with matched route can be read as shown below:

```javascript
// Use information from the matched route
app.use((req, res, next) => {
  const route = req.route;
  if (route) {
    console.log("Route params: ", route.params); // e.g. { user: 'John' }
    console.log("Route path: ", route.path); // e.g. "/users/123"
    console.log("Route meta: ", route.config.foo); // e.g. "bar"
  }
  next();
});
```

## match() middleware

The `match` middleware matches an incoming request to one of the possible routes. If an incoming request matched any routes passed in then the [`req.route`](#req-route) property will be populated with information about the route. The `configure` api must be called before the `match` middleware runs. This middleware should be registered before any other middleware which wish to read route meta data.

```javascript
app.use(metaRouter.match());
```

## invoke() middleware

The `invoke` middleware will call a handler associated with the route matched by the [`match`](#match-middleware) middleware. This middleware should be placed after all other middleware which wish to read route meta data.

```javascript
app.use(metaRouter.invoke());
```

## getMatch({ path: string, method: string }): MatchedRoute

The `getMatch` api will synchronously return a matched route with the same properties as [`req.route`](#req-route) or `undefined` if there is no match.
This is useful for building tools that read route meta data, without necessarily needing to execute any handlers (which are not loaded via this api).

```javascript
metaRouter.configure({
  routes: [
    {
      route: "GET /test => ./handler",
      someData: true,
    },
  ],
});

metaRouter.getMatch({ path: "/test", method: "GET" }); /* returns: {
  path: "/test",
  params: undefined,
  config: { someData: true }
}*/
```

## create()

All of `meta-router`'s top level api's (besides this one) expose methods on a singleton instance. The `create` API allows you to create new meta-router instances with the same top level API.
This can be useful for testing, or building nested routers.

```javascript
const nestedRouter = metaRouter.create();

nestedRouter.configure({
   routes: [...]
});

app.use(nestedRouter.match());
// ...
app.use(nestedRouter.invoke());
```

# Code of Conduct

This project adheres to the [eBay Code of Conduct](./.github/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
