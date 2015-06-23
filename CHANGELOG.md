Changelog
=========

# 3.x

## 3.0.x

### 3.0.0

- The options passed to [path-to-regexp](https://github.com/component/path-to-regexp) must now provided via the `matchOptions` property of a route configuration as shown below:

```json
[

    {
        "route": "GET /users/:user => ./user",
        "security": {
            "authenticationRequired": true,
            "redirect": true
        },
        "matchOptions": {
            "sensitive": false,
            "strict": false,
            "end": true
        }
    },
    ...
]
```

Supported properties for `matchOptions`:

- **sensitive** When `true` the route will be case sensitive. (default: `false`)
- **strict** When `false` the trailing slash is optional. (default: `false`)
- **end** When `false` the path will match at the beginning. (default: `true`)

Previously, the match options could be provided via top-level `caseSensitive`, `strict` and `end` properties. Those properties are no longer supported.

# 2.x

## 2.1.x

### 2.1.0

- Fixes [#7](https://github.com/patrick-steele-idem/meta-router/issues/7) - Allow route metadata to be attached to route handler function:

```javascript
function userHandler(req, res, next) {
    // ...
}

userHandler.routeMeta = {
    security: {
        authenticationRequired: true,
        redirect: true
    }
}

// You can also optionally attach middleware to the route:
userHandler.routeMiddleware = [
    function (req, res, next) {
        // ...
    },
    // ...
]

module.exports = userHandler;
```

- Introduced new shorthand syntax for declaring routes in JSON:

```json
[

    "GET /users/:user => ./user",
    "GET /login => ./user#login",
    "GET /logout => ./user#logout",
    "POST /users/:user/picture => ./user#uploadPicture"
]
```
