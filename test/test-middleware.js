const expect = require('chai').expect;
const request = require('request');
const express = require('express');
const http = require('http');
const nodePath = require('path');

let app;
let server;
let port;

function jsonRequest(path, method, callback) {
    const options = {
        url: 'http://localhost:' + port + path,
        method: method || 'GET'
    };
    request(options, (err, response, body) => {
        if (err) {
            return callback(err);
        }

        if (response.statusCode === 200) {
            body = JSON.parse(body);
        }

        callback(null, response, body);
    });
}

describe('middleware' , () => {

    before((done) => {

        const metaRouterMiddleware = require('../middleware');
        app = express();

        app.use(metaRouterMiddleware.match([
                {
                    path: 'GET /users/:user',
                    handler(req, res) {
                        res.send({
                            user: req.params.user,
                            foo: req.route.config.foo
                        });
                    },
                    foo: 'bar'
                },
                {
                    path: 'POST /users/:user/picture',
                    handler(req, res) {
                        res.end('User profile picture updated!');
                    }
                },
                {
                    path: 'GET /middleware/foo',
                    middleware: [
                        (req, res, next) => {
                            req.foo = true;
                            next();
                        },
                        (req, res, next) => {
                            req.bar = true;
                            next();
                        }
                    ],
                    handler(req, res) {
                        res.status(200).send({
                            foo: req.foo,
                            bar: req.bar
                        });
                    }
                },
                {
                    path: 'GET /middleware/bar',
                    middleware: [
                        {
                            factory(arg) {
                                return (req, res, next) => {
                                    req[arg] = true;
                                    next();
                                };
                            },
                            arguments: ['factory1']
                        },
                        {
                            factory: {
                                baz(arg) {
                                    return (req, res, next) => {
                                        req[arg] = true;
                                        next();
                                    };
                                }
                            },
                            method: 'baz',
                            arguments: ['factory2']
                        },
                        (req, res, next) => {
                            req.bar = true;
                            next();
                        }
                    ],
                    handler(req, res) {
                        res.status(200).send({
                            factory1: req.factory1,
                            factory2: req.factory2,
                            bar: req.bar
                        });
                    }
                },
                {
                    path: 'GET /error',
                    handler(req, res, next) {
                        next(new Error('Test error'));
                    }
                },
            ]));

        app.use((req, res, next) => {
            req.matchedRoute = req.route;
            next();
        });

        app.use(metaRouterMiddleware.invokeHandler());

        app.use((req, res, next) => {
          res.status(404).end('Not Found');
        });

        app.use((err, req, res, next) => {
          console.error(err.stack);
          res.status(500).end('Server error');
        });

        server = http.createServer(app);
        server.on('listening', () => {
            port = server.address().port;
            done();
        });
        server.listen();
    });

    after(() => {
        server.close();
    });

    it('should support match() and invokeHandler() middleware', done => {
        jsonRequest('/users/123', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                user: '123',
                foo: 'bar'
            });

            done();
        });
    });

    it('should support route-specific middleware (non-factory function)', done => {
        jsonRequest('/middleware/foo', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                foo: true,
                bar: true
            });

            done();
        });
    });

    it('should support route-specific middleware (factory function)', done => {
        jsonRequest('/middleware/bar', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                factory1: true,
                factory2: true,
                bar: true
            });

            done();
        });
    });

    it('should handle error and generate 500', done => {
        jsonRequest('/error', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(response.statusCode).to.equal(500);

            done();
        });
    });
});

describe('middleware with subapps' , () => {

    before(done => {
        const metaRouterMiddleware = require('../middleware');

        function apiApp() {
            const app = express();

            app.use(metaRouterMiddleware.match([
                    {
                        path: 'GET /hello/:world',
                        handler(req, res) {
                            res.send({
                                apiHello: req.params.world
                            });
                        },
                        foo: 'bar'
                    }
                ]));

            app.get('/foo/:bar', (req, res) => {
                res.send({
                    apiBar: req.params.bar
                });
            });

            app.use(metaRouterMiddleware.invokeHandler());

            return app;
        }

        app = express();

        app.use(metaRouterMiddleware.match([
                {
                    path: 'GET /users/:user',
                    handler(req, res) {
                        res.send({
                            user: req.params.user,
                            foo: req.route.config.foo
                        });
                    },
                    foo: 'bar'
                },
                {
                    path: 'POST /users/:user/picture',
                    handler(req, res) {
                        res.end('User profile picture updated!');
                    }
                }
            ]));

        app.use((req, res, next) => {
            req.matchedRoute = req.route;
            next();
        });

        app.use(metaRouterMiddleware.invokeHandler());

        app.use('/api', apiApp());

        app.use((req, res, next) => {
          res.send(404, 'Not Found');
        });

        app.use((err, req, res, next) => {
          console.error(err.stack);
          res.send(500, 'Server error');
        });

        server = http.createServer(app);
        server.on('listening', () => {
            port = server.address().port;
            done();
        });
        server.listen();
    });

    after(() => {
        server.close();
    });

    it('should match allow Express router to be used in subapp correctly', done => {
        jsonRequest('/api/foo/123', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                apiBar: '123'
            });

            done();
        });
    });

    it('should match allow meta-router to be used in subapp', done => {
        jsonRequest('/api/hello/345', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                apiHello: '345'
            });

            done();
        });


    });
});

describe('middleware using routes.json' , () => {
    before(done => {

        const metaRouterMiddleware = require('../middleware');
        app = express();

        app.use(metaRouterMiddleware.match(nodePath.join(__dirname, 'fixtures/routes.json')));

        app.use((req, res, next) => {
            req.matchedRoute = req.route;
            next();
        });

        app.use(metaRouterMiddleware.invokeHandler());

        app.use((req, res, next) => {
          res.send(404, 'Not Found');
        });

        app.use((err, req, res, next) => {
          console.error(err.stack);
          res.send(500, 'Server error');
        });

        server = http.createServer(app);
        server.on('listening', () => {
            port = server.address().port;
            done();
        });

        server.listen();
    });

    after(() => {
        server.close();
    });

    it('should match a route loaded from a json file', done => {
        jsonRequest('/users/frank', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                message: 'Hello frank!'
            });

            done();
        });
    });

    it('should match a route loaded from a json file with a method', done => {
        jsonRequest('/foo', 'GET', (err, response, result) => {
            if (err) {
                return done(err);
            }

            expect(result).to.deep.equal({
                message: 'foo'
            });

            done();
        });
    });
});