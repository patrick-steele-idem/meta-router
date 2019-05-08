exports.load = (path, callback) => {
    callback(null, require(path));
};