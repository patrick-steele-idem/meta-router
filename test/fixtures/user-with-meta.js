module.exports = function userHandler(req, res) {
    res.send({
        message: 'Hello ' + req.params.user + '!'
    });
};

module.exports.routeMeta = {
    meta1: true
};

module.exports.foo = function foo(req, res) {
    res.send({
        message: 'foo'
    });
};

module.exports.foo.routeMeta = {
    meta2: true
};

module.exports.bar = function bar(req, res) {
    res.send({
        message: 'bar'
    });
};

module.exports.bar.routeMeta = {
    meta3: true
};