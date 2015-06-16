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

function resolveHandler(unresolvedHandlerPath, dirname) {
    var pathMethodMatches = modulePathMethodRegExp.exec(unresolvedHandlerPath);
    var methodName;
    var handlerPath;

    if (pathMethodMatches) {
        handlerPath = pathMethodMatches[1];
        methodName = pathMethodMatches[2];
    } else {
        handlerPath = unresolvedHandlerPath;
    }

    var handler = require(resolveFrom(dirname, handlerPath));

    if (methodName) {
        handler = handler[methodName];
        if (!handler) {
            throw new Error('Handler property not found: ' + handlerPath + ' (from directory: ' + dirname + ')');
        }
    }

    if (!handler) {
        throw new Error('Handler not found: ' + handlerPath + ' (from directory: ' + dirname + ')');
    }

    return handler;
}

function createRequireResolver(dirname) {
    return function requireResolver(target) {
        var methodSeparator = target.lastIndexOf('#');
        var methodName;

        if (methodSeparator !== -1) {
            methodName = target.substring(methodSeparator+1);
            target = target.substring(0, methodSeparator);
        }


        var modulePath = resolveFrom(dirname, target);
        var requiredModule = require(modulePath);
        if (methodName) {
            requiredModule = requiredModule[methodName];
            if (requiredModule == null) {
                throw new Error('Method with name "' + methodName + '" not found in module at path "' + modulePath + '"');
            }
        }
        return requiredModule;
    };
}

exports.load = function(path, callback) {
    var dirname = nodePath.dirname(path);

    var resolver = shortstop.create();
    resolver.use('path',   shortstopHandlers.path(dirname));
    resolver.use('file',   shortstopHandlers.file(dirname));
    resolver.use('base64', shortstopHandlers.base64());
    resolver.use('env',    shortstopHandlers.env());
    resolver.use('require', createRequireResolver(dirname));
    resolver.use('exec',   shortstopHandlers.exec(dirname));

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

        resolver.resolve(routesConfig, function(err, routesConfig) {
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
                    routeConfig.handler = resolveHandler(routeConfig.handler, dirname);
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

                    var handler = resolveHandler(handlerPath, dirname);

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

};