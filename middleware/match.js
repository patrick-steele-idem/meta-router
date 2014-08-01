var metaRouter = require('../');
var DataHolder = require('raptor-async/DataHolder');
var nodePath = require('path');

module.exports = function match(routes) {
    var matcher;
    var matcherDataHolder;

    if (typeof routes === 'string') {
        routes = nodePath.resolve(process.cwd(), routes);
        
        matcherDataHolder = new DataHolder();
        metaRouter.routesLoader.load(routes, function(err, routes) {
            if (err) {
                return matcherDataHolder.reject(err);
            }

            matcher = metaRouter.buildMatcher(routes);
            matcherDataHolder.resolve(matcher);
        });
    } else {
        matcher = metaRouter.buildMatcher(routes);
    }

    function go(matcher, req, res, next) {
        var match = matcher.match(req.method, req.path);
        if (match) {
            req.route = match;
        }

        next(); 
    }

    return function(req, res, next) {
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