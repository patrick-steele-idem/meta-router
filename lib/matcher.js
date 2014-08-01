var pathToRegexp = require('path-to-regexp');
var ok = require('assert').ok;
var inspect = require('util').inspect;
var methodPathRegExp = /^([^\s]+)\s+(.+)$/;

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

    this.keys = [];

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


function buildMatcher(routesConfig) {
    ok(Array.isArray(routesConfig), 'Array expected for routes');

    var routes = [];

    routesConfig.forEach(function(routeConfig) {
        routes.push(new Route(routeConfig));
    });

    var len = routes.length;

    return {
        match: function matcher(method, path) {
            for (var i=0; i<len; i++) {
                var match = routes[i].match(method, path);
                if (match) {
                    return match;
                }
            }

            return null;
        }
    };
}

exports.buildMatcher = buildMatcher;