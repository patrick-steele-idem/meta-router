var pathToRegexp = require('path-to-regexp');
var inspect = require('util').inspect;
var methodPathRegExp = /^([^\s]+)\s+(.+)$/;
var extend = require('raptor-util/extend');

function createHandlerFromMiddleware(middleware) {
    var len = middleware.length;

    return function (req, res, finalNext) {
        var i=-1;

        function next(err) {
            if (err) {
                return finalNext(err);
            }
            i++;

            if (i === len) {
                finalNext();
            } else {
                middleware[i](req, res, next);
            }
        }

        next();
    };
}

function Route(routeConfig) {
    var path = routeConfig.path;
    if (!path) {
        throw new Error('"path" is required for route. Route config: ' + inspect(routeConfig));
    }

    var methods = null;

    var methodPathMatches = methodPathRegExp.exec(path);
    if (methodPathMatches) {
        methods = methodPathMatches[1].split(/[,]/);
        path = methodPathMatches[2];
    } else {
        methods = routeConfig.method ? [routeConfig.method] : routeConfig.methods;
    }

    if (methods) {
        methods = methods.map(function(method) {
            method = method.toUpperCase();
            return method === 'ALL' ? '*' : method;
        });
    } else {
        methods = ['*'];
    }

    var methodLookup = this.methods = {};

    methods.forEach(function(method) {
        methodLookup[method] = true;
    });

    // Allow quick check for most common methods
    this.isAll = methodLookup.hasOwnProperty('*');
    this.isGet = methodLookup.hasOwnProperty('GET');
    this.isPost = methodLookup.hasOwnProperty('POST');
    this.methods = methods;

    this.keys = [];
    this.path = path;
    this.regExp = pathToRegexp(
        path,
        this.keys,
        routeConfig.matchOptions);

    this.everything = path === '/';

    var normalizedRouteConfig = {};

    for (var k in routeConfig) {
        if (routeConfig.hasOwnProperty(k)) {
            normalizedRouteConfig[k] = routeConfig[k];
        }
    }

    delete normalizedRouteConfig.method;
    normalizedRouteConfig.methods = Object.keys(methodLookup).sort();
    normalizedRouteConfig.path = path;

    var middleware = routeConfig.middleware;


    if (middleware) {
        normalizedRouteConfig.middleware = middleware;

        middleware = middleware
            .map(function(middlewareConfig) {
                if (middlewareConfig == null) {
                    return null;
                } else if (typeof middlewareConfig === 'function') {
                    return middlewareConfig;
                } else if (typeof middlewareConfig === 'object') {
                    if (middlewareConfig.enabled === false) {
                        return null;
                    }

                    var method = middlewareConfig.method;
                    var func = middlewareConfig.module;

                    if (func != null) {
                        if (method) {
                            func = func[method];
                        }
                    } else {
                        var factory = middlewareConfig.factory;
                        if (factory != null) {
                            if (method) {
                                factory = factory[method];
                            }

                            if (factory != null) {
                                func = factory.apply(this, middlewareConfig.arguments || []);
                            }
                        }
                    }

                    if (func == null) {
                        throw new Error('Invalid middleware: ' + inspect(middlewareConfig));
                    }

                    if (typeof func !== 'function') {
                        throw new Error('Invalid middleware. Function expected. Config: ' + inspect(middlewareConfig));
                    }

                    return func;
                }
            })
            .filter(function(middleware) {
                return middleware != null;
            });


    } else {
        middleware = [];
    }

    var handler;

    if ((handler = routeConfig.handler)) {
        normalizedRouteConfig.handler = handler;

        var routeMetadata = handler.routeMeta || handler.routeMetadata;
        if (routeMetadata) {
            extend(normalizedRouteConfig, routeMetadata);
        }

        if (Array.isArray(handler.routeMiddleware)) {
            normalizedRouteConfig.middleware = middleware = middleware.concat(handler.routeMiddleware);
        }

        // Route handler is the last middleware in the chain
        middleware.push(handler);
    }


    normalizedRouteConfig._handler = middleware.length ? createHandlerFromMiddleware(middleware) : null;

    this.config = normalizedRouteConfig;
}

Route.prototype = {
    match: function(path, method) {
        if (this.isAll ||
            (this.isGet && method === 'GET') ||
            (this.isPost && method === 'POST') ||
            this.methods.hasOwnProperty(method)) {

            // Method matches this route so let's see if the incoming path
            // matches the generated regular expression...
            var params = {};
            var matchedPath;

            if (this.everything) {
                matchedPath = path;
            } else {
                var pathMatches = this.regExp.exec(path);
                if (!pathMatches) {
                    return null;
                }

                matchedPath = pathMatches[0];

                var keys = this.keys;
                var n = 0;
                var key;
                var val;

                for (var i = 1, len = pathMatches.length; i < len; ++i) {
                    key = keys[i - 1];
                    val = pathMatches[i];
                    if (val != null) {
                        val = decodeURIComponent(val);
                    }

                    if (key) {
                        params[key.name] = val;
                    } else {
                        params[n++] = val;
                    }
                }
            }

            return {
                params: params,
                path: matchedPath,
                config: this.config
            };
        } else {
            return null;
        }
    }
};

module.exports = Route;