module.exports = function invokeHandlerFactory() {
    return function invokeHandler(req, res, next) {
        const route = req.route;
        let handler;

        if (route && (handler = route.config._handler)) {

            const params = route.params;
            
            if (params) {
                const paramsTarget = req.params || (req.params = {});
                for (const paramName in params) {
                    paramsTarget[paramName] = params[paramName];
                }
            }

            handler(req, res, next);
        } else {
            next();
        }
    };
};