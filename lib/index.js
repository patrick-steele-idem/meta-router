var pathToRegexp = require('path-to-regexp');
var ok = require('assert').ok;
var inspect = require('util').inspect;
var methodPathRegExp = /^([^\s]+)\s+(.+)$/;
var routesList =[];
var loader = require('./routes-loader');

function createHandler(middleware) {
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
        {
            sensitive: routeConfig.caseSensitive === true,
            strict: routeConfig.strict === true,
            end: routeConfig.end === true
        });

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

    if (routeConfig.handler) {
        // Route handler is the last middleware in the chain
        middleware.push(routeConfig.handler);
    }

    normalizedRouteConfig._handler = middleware.length ? createHandler(middleware) : null;

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

function buildMatcherAsync(routes, callback) {
    if (typeof routes === 'string') {
        loader.load(routes, function(err, routes) {
            if (err) {
                return callback(err);
            }

            callback(null, buildMatcher(routes));
        });
    } else {
        callback(null, buildMatcher(routes));
    }
}

function buildMatcher(routesConfig, callback) {
    if (typeof callback === 'function') {
        return buildMatcherAsync(routesConfig, callback);
    }

    ok(Array.isArray(routesConfig), 'Array expected for routes');

    var routes = [];

    routesConfig.forEach(function(routeConfig) {
        routes.push(new Route(routeConfig));
    });

    routesList = routes;
    var len = routes.length;

    return {
        match: function matcher(path, method) {
            for (var i=0; i<len; i++) {
                var match = routes[i].match(path, method);
                if (match) {
                    return match;
                }
            }

            return null;
        },
        routes: routes
    };
}

exports.buildMatcher = buildMatcher;
