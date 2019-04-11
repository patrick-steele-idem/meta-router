var resolveFrom = require('resolve-from');
var shortstop = require('shortstop');
var shortstopHandlers = require('shortstop-handlers');
var nodePath = require('path');
var fs = require('fs');
var jsonminify = require('jsonminify');
var modulePathMethodRegExp = /([^#]+)#(.+)\s*$/;
var shorthandRegExp = /(.+)\s+=>\s+(.+)/;
var extend = require('raptor-util/extend');
var inspect = require('util').inspect;

exports.load = function(path, callback) {
    internalLoad(path, function () {
        var resolved = baseResolver.apply(null, arguments);
        return resolved.methodName ? require(resolved.path)[resolved.methodName] : require(resolved.path);
    }, callback);
};

exports.loadWithoutRequire = function(path, callback) {
    internalLoad(path, baseResolver, callback);
};

function baseResolver(unresolvedPath, dirname) {
    var pathMethodMatches = modulePathMethodRegExp.exec(unresolvedPath);
    var methodName;

    if (pathMethodMatches) {
        unresolvedPath = pathMethodMatches[1];
        methodName = pathMethodMatches[2];
    }

    return {
        require: true,
        path: resolveFrom(dirname, unresolvedPath),
        methodName: methodName
    };
}

function createRequireResolver(resolver, dirname) {
    return function requireResolver(target) {
        return resolver(target, dirname);
    };
}

function internalLoad(path, resolver, callback) {
    var dirname = nodePath.dirname(path);

    var shortstopResolver = shortstop.create();
    shortstopResolver.use('path',   shortstopHandlers.path(dirname));
    shortstopResolver.use('require', createRequireResolver(resolver, dirname));

    fs.readFile(path, {encoding: 'utf8'}, function(err, routesJSON) {
        if (err) {
            return callback(err);
        }

        var routesConfig;

        try {
            routesConfig = JSON.parse(jsonminify(routesJSON));
        } catch(e) {
            throw new Error('Unable to parse routes JSON file at path "' + path + '". Exception: ' + e);
        }

        shortstopResolver.resolve(routesConfig, function(err, routesConfig) {
            if (err) {
                return callback(err);
            }

            var routeString;
            var path;

            for (var i=0; i<routesConfig.length; i++) {
                var routeConfig = routesConfig[i];

                routeString = null;

                if (typeof routeConfig === 'string') {
                    routeString = routeConfig;
                } else if (typeof routeConfig.handler === 'string') {
                    routeConfig = extend({}, routeConfig);
                    routeConfig.handler = resolver(routeConfig.handler, dirname);
                    routesConfig[i] = routeConfig;
                }

                if (!routeConfig.handler) {
                    routeString = routeString || routeConfig.route || routeConfig.path;

                    if (!routeString) {
                        throw new Error('Invalid route: ' + inspect(routeConfig));
                    }

                    var matches = shorthandRegExp.exec(routeString);
                    if (!matches) {
                        throw new Error('Invalid route: ' + inspect(routeConfig));
                    }

                    path = matches[1];
                    var handlerPath = matches[2];

                    var handler = resolver(handlerPath, dirname);

                    if (typeof routeConfig === 'string') {
                        routeConfig = {
                            path: path,
                            handler: handler
                        };
                    } else {
                        routeConfig = extend({}, routeConfig);
                        routeConfig.path = path;
                        routeConfig.handler = handler;
                    }

                    routesConfig[i] = routeConfig;
                }
            }

            callback(null, routesConfig);
        });
    });
}