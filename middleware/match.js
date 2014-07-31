var metaRouter = require('../');

module.exports = function match(routes) {
    var matcher = metaRouter.buildMatcher(routes);

    return function(req, res, next) {
        var match = matcher.match(req.method, req.path);
        if (match) {
            req.route = match;
        }

        next();
    };
};