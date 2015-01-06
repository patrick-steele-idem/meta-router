var metaRouter = require('../');
var DataHolder = require('raptor-async/DataHolder');
var nodePath = require('path');

module.exports = function matchFactory(routes) {
    var matcher;
    var matcherDataHolder;

    if (typeof routes === 'string') {
        routes = nodePath.resolve(process.cwd(), routes);
        matcherDataHolder = new DataHolder();

        metaRouter.buildMatcher(routes, function(err, matcher) {
            if (err) {
                return matcherDataHolder.reject(err);
            }

            matcherDataHolder.resolve(matcher);
        });
    } else if (typeof routes.match === 'function') {
        // The provided routes are already a matcher
        matcher = routes;
    } else {
        matcher = metaRouter.buildMatcher(routes);
    }

    function go(matcher, req, res, next) {
        var match = matcher.match(req.path, req.method);
        if (match) {
            req.route = match;
        }

        next();
    }

    return function match(req, res, next) {
        if (matcher) {
            go(matcher, req, res, next);
        } else {
            matcherDataHolder.done(function(err, matcher) {
                if (err) {
                    return next(err);
                }

                go(matcher, req, res, next);
            });
        }

    };
};