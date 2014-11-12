exports.load = function(path, callback) {
    callback(null, require(path));
};