module.exports = function invokeHandlerFactory() {
    return function invokeHandler(req, res, next) {
        var route = req.route;
        var handler;

        if (route && (handler = route.config._handler)) {

            var params = route.params;
            
            if (params) {
                var paramsTarget = req.params || (req.params = {});
                for (var paramName in params) {
                    paramsTarget[paramName] = params[paramName];
                }
            }

            handler(req, res, next);
        } else {
            next();
        }
    };
};