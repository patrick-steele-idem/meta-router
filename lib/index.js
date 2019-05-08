
const ok = require('assert').ok;

const loader = require('./routes-loader');
const Route = require('./Route');

function buildMatcherAsync(routes, callback) {
    if (typeof routes === 'string') {
        loader.load(routes, (err, routes) => {
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

    const routes = routesConfig.map(routeConfig => {
        return new Route(routeConfig);
    });

    const len = routes.length;

    return {
        match: function matcher(path, method) {
            for (let i=0; i<len; i++) {
                const match = routes[i].match(path, method);
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
