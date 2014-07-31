module.exports = function userHandler(req, res) {
    res.send({
        message: 'Hello ' + req.params.user + '!'
    });
};