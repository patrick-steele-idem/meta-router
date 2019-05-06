const resolveFrom = require('resolve-from');
const shortstop = require('shortstop');
const shortstopHandlers = require('shortstop-handlers');
const nodePath = require('path');
const fs = require('fs');
const jsonminify = require('jsonminify');
const modulePathMethodRegExp = /([^#]+)#(.+)\s*$/;
const shorthandRegExp = /(.+)\s+=>\s+(.+)/;
const extend = require('raptor-util/extend');
const inspect = require('util').inspect;

exports.load = (path, callback) => {
    internalLoad(path, (...args) => {
        const resolved = baseResolver(...args);
        return resolved.methodName ? require(resolved.path)[resolved.methodName] : require(resolved.path);
    }, callback);
};

exports.loadWithoutRequire = (path, callback) => {
    internalLoad(path, baseResolver, callback);
};

function baseResolver(unresolvedPath, dirname) {
    const pathMethodMatches = modulePathMethodRegExp.exec(unresolvedPath);
    let methodName;

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
    const dirname = nodePath.dirname(path);

    const shortstopResolver = shortstop.create();
    shortstopResolver.use('path',   shortstopHandlers.path(dirname));
    shortstopResolver.use('require', createRequireResolver(resolver, dirname));

    fs.readFile(path, {encoding: 'utf8'}, (err, routesJSON) => {
        if (err) {
            return callback(err);
        }

        let routesConfig;

        try {
            routesConfig = JSON.parse(jsonminify(routesJSON));
        } catch(e) {
            throw new Error('Unable to parse routes JSON file at path "' + path + '". Exception: ' + e);
        }

        shortstopResolver.resolve(routesConfig, (err, routesConfig) => {
            if (err) {
                return callback(err);
            }

            let routeString;
            let path;

            for (let i=0; i<routesConfig.length; i++) {
                let routeConfig = routesConfig[i];

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

                    const matches = shorthandRegExp.exec(routeString);
                    if (!matches) {
                        throw new Error('Invalid route: ' + inspect(routeConfig));
                    }

                    path = matches[1];
                    const handlerPath = matches[2];

                    const handler = resolver(handlerPath, dirname);

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