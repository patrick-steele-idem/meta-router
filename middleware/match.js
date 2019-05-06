const metaRouter = require('../');
const AsyncValue = require('raptor-async/AsyncValue');
const nodePath = require('path');

module.exports = function matchFactory(routes) {
    let matcher;
    let matcherAsyncValue;

    if (typeof routes === 'string') {
        routes = nodePath.resolve(process.cwd(), routes);
        matcherAsyncValue = new AsyncValue();

        metaRouter.buildMatcher(routes, (err, matcher) => {
            if (err) {
                return matcherAsyncValue.reject(err);
            }

            matcherAsyncValue.resolve(matcher);
        });
    } else if (typeof routes.match === 'function') {
        // The provided routes are already a matcher
        matcher = routes;
    } else {
        matcher = metaRouter.buildMatcher(routes);
    }

    function go(matcher, req, res, next) {
        const match = matcher.match(req.path, req.method);
        if (match) {
            req.route = match;
        }

        next();
    }

    return function match(req, res, next) {
        if (matcher) {
            go(matcher, req, res, next);
        } else {
            matcherAsyncValue.done((err, matcher) => {
                if (err) {
                    // Crash the process via an uncaught exception since
                    // the routes failed to load
                    throw err;
                }

                go(matcher, req, res, next);
            });
        }

    };
};