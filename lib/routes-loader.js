var resolveFrom = require('resolve-from');
var shortstop = require('shortstop');
var shortstopHandlers = require('shortstop-handlers');
var nodePath = require('path');
var fs = require('fs');
var jsonminify = require('jsonminify');

function createRequireResolver(dirname) {
    return function requireResolver(target) {
        var modulePath = resolveFrom(dirname, target);
        return require(modulePath);
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
        var routesConfig;

        try {
            routesConfig = JSON.parse(jsonminify(routesJSON));
        } catch(e) {
            return callback(new Error('Unable to parse JSON file at path "' + path + '". Exception: ' + e));
        }

        resolver.resolve(routesConfig, callback);
    });

};