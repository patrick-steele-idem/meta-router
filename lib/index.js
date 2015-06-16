
var ok = require('assert').ok;

var loader = require('./routes-loader');
var Route = require('./Route');

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

    var routes = routesConfig.map(function(routeConfig) {
        return new Route(routeConfig);
    });

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
