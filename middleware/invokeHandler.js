module.exports = function invokeHandler() {
    return function(req, res, next) {
        var route = req.route;
        var handler;

        if (route && (handler = route.config.handler)) {
            var params = route.params;
            
            if (params) {
                var paramsTarget = req.params || (req.params = {});
                for (var paramName in params) {
                    paramsTarget[paramName] = params[paramName];
                }
            }

            handler(req, res);
        } else {
            next();
        }
    };
};