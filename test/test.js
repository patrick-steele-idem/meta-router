'use strict';
var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var request = require('request');
var express = require('express');
var http = require('http');
var nodePath = require('path');

var app;
var server;
var port;

function jsonRequest(path, method, callback) {
    var options = {
        url: 'http://localhost:' + port + path,
        method: method || 'GET'
    };
    request(options, function(err, response, body) {
        if (err) {
            return callback(err);
        }

        if (response.statusCode === 200) {
            body = JSON.parse(body);
        }

        callback(null, response, body);
    });
}

describe('meta-router' , function() {

    beforeEach(function(done) {
        // for (var k in require.cache) {
        //     if (require.cache.hasOwnProperty(k)) {
        //         delete require.cache[k];
        //     }
        // }

        done();
    });

    describe('matcher' , function() {
        it('should match sample routes correctly', function() {
            var metaRouter = require('../');
            var matcher = metaRouter.buildMatcher([
                {
                    "path": "GET /users/:user",
                    "handler": function(req, res) {
                        res.end('Hello user: ' + req.params.user);
                    },
                    // Arbitrary metadata:
                    "foo": "bar"
                },
                {
                    path: "POST /users/:user/picture",
                    handler: function(req, res) {
                        res.end('User profile picture updated!');
                    }
                }
            ]);

            var match = matcher.match('/users/123', 'GET');
            expect(match != null).to.equal(true);
            expect(match.path).to.equal('/users/123');
            expect(match.params).to.deep.equal({ user: '123' });
            expect(match.config.path).to.equal('/users/:user');
            expect(match.config.handler).to.be.a('function');
            expect(match.config.methods).to.deep.equal(['GET']);
            expect(match.config.foo).to.equal('bar');

            match = matcher.match('/usersINVALID/123', 'GET');

            expect(match == null).to.equal(true);

            match = matcher.match('/users/123', 'POST');
            expect(match == null).to.equal(true);

            match = matcher.match('/users/123/picture', 'POST');
            expect(match != null).to.equal(true);
            expect(match.path).to.equal('/users/123/picture');
            expect(match.params).to.deep.equal({ user: '123' });
            expect(match.config.path).to.equal('/users/:user/picture');
            expect(match.config.handler).to.be.a('function');
            expect(match.config.methods).to.deep.equal(['POST']);


        });

        it('should allow method to be optional', function() {
            var metaRouter = require('../');
            var matcher = metaRouter.buildMatcher([
                {
                    path: "/users/:user/picture",
                    handler: function(req, res) {
                        res.end('User profile picture updated!');
                    }
                },
                {
                    "path": "/users/:user",
                    "handler": function(req, res) {
                        res.end('Hello user: ' + req.params.user);
                    },
                    // Arbitrary metadata:
                    "foo": "bar"
                }
            ]);

            var match = matcher.match('/users/123');
            expect(match != null).to.equal(true);
            expect(match.path).to.equal('/users/123');
            expect(match.params).to.deep.equal({ user: '123' });
            expect(match.config.path).to.equal('/users/:user');
            expect(match.config.handler).to.be.a('function');
            expect(match.config.foo).to.equal('bar');

            match = matcher.match('/usersINVALID/123');
            expect(match == null).to.equal(true);

            match = matcher.match('/users/123/picture');
            expect(match != null).to.equal(true);
            expect(match.path).to.equal('/users/123/picture');
            expect(match.params).to.deep.equal({ user: '123' });
            expect(match.config.path).to.equal('/users/:user/picture');
            expect(match.config.handler).to.be.a('function');
        });
    });

    describe('middleware' , function() {

        before(function(done) {

            var metaRouterMiddleware = require('../middleware');
            app = express();

            app.use(metaRouterMiddleware.match([
                    {
                        path: 'GET /users/:user',
                        handler: function(req, res) {
                            res.send({
                                user: req.params.user,
                                foo: req.route.config.foo
                            });
                        },
                        foo: 'bar'
                    },
                    {
                        path: 'POST /users/:user/picture',
                        handler: function(req, res) {
                            res.end('User profile picture updated!');
                        }
                    },
                    {
                        path: 'GET /middleware/foo',
                        middleware: [
                            function foo(req, res, next) {
                                req.foo = true;
                                next();
                            },
                            function bar(req, res, next) {
                                req.bar = true;
                                next();
                            }
                        ],
                        handler: function handler(req, res) {
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
                                factory: function(arg) {
                                    return function(req, res, next) {
                                        req[arg] = true;
                                        next();
                                    };
                                },
                                arguments: ['factory1']
                            },
                            {
                                factory: {
                                    baz: function(arg) {
                                        return function(req, res, next) {
                                            req[arg] = true;
                                            next();
                                        };
                                    }
                                },
                                method: 'baz',
                                arguments: ['factory2']
                            },
                            function bar(req, res, next) {
                                req.bar = true;
                                next();
                            }
                        ],
                        handler: function handler(req, res) {
                            res.status(200).send({
                                factory1: req.factory1,
                                factory2: req.factory2,
                                bar: req.bar
                            });
                        }
                    }
                ]));

            app.use(function(req, res, next) {
                req.matchedRoute = req.route;
                next();
            });

            app.use(metaRouterMiddleware.invokeHandler());

            app.use(function(req, res, next){
              res.status(404).end('Not Found');
            });

            app.use(function(err, req, res, next){
              console.error(err.stack);
              res.status(500).end('Server error');
            });

            server = http.createServer(app);
            server.on('listening', function() {
                port = server.address().port;
                done();
            });
            server.listen();
        });

        after(function() {
            server.close();
        });

        it('should support match() and invokeHandler() middleware', function(done) {
            jsonRequest('/users/123', 'GET', function(err, response, result) {
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

        it('should support route-specific middleware (non-factory function)', function(done) {
            jsonRequest('/middleware/foo', 'GET', function(err, response, result) {
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

        it('should support route-specific middleware (factory function)', function(done) {
            jsonRequest('/middleware/bar', 'GET', function(err, response, result) {
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
    });

    describe('middleware with subapps' , function() {
        var app;
        var server;
        var port;

        function jsonRequest(path, method, callback) {
            var options = {
                url: 'http://localhost:' + port + path,
                method: method || 'GET'
            };
            request(options, function(err, response, body) {
                if (err) {
                    return callback(err);
                }

                if (response.statusCode === 200) {
                    body = JSON.parse(body);
                }

                callback(null, response, body);
            });
        }

        before(function(done) {

            function apiApp() {
                var app = express();

                app.use(metaRouterMiddleware.match([
                        {
                            path: 'GET /hello/:world',
                            handler: function(req, res) {
                                res.send({
                                    apiHello: req.params.world
                                });
                            },
                            foo: 'bar'
                        }
                    ]));

                app.get('/foo/:bar', function(req, res) {
                    res.send({
                        apiBar: req.params.bar
                    });
                });

                app.use(metaRouterMiddleware.invokeHandler());

                return app;
            }

            var metaRouterMiddleware = require('../middleware');
            app = express();

            app.use(metaRouterMiddleware.match([
                    {
                        path: 'GET /users/:user',
                        handler: function(req, res) {
                            res.send({
                                user: req.params.user,
                                foo: req.route.config.foo
                            });
                        },
                        foo: 'bar'
                    },
                    {
                        path: 'POST /users/:user/picture',
                        handler: function(req, res) {
                            res.end('User profile picture updated!');
                        }
                    }
                ]));

            app.use(function(req, res, next) {
                req.matchedRoute = req.route;
                next();
            });

            app.use(metaRouterMiddleware.invokeHandler());

            app.use('/api', apiApp());

            app.use(function(req, res, next){
              res.send(404, 'Not Found');
            });

            app.use(function(err, req, res, next){
              console.error(err.stack);
              res.send(500, 'Server error');
            });

            server = http.createServer(app);
            server.on('listening', function() {
                port = server.address().port;
                done();
            });
            server.listen();
        });

        after(function() {
            server.close();
        });

        it('should match allow Express router to be used in subapp correctly', function(done) {
            jsonRequest('/api/foo/123', 'GET', function(err, response, result) {
                if (err) {
                    return done(err);
                }

                expect(result).to.deep.equal({
                    apiBar: '123'
                });

                done();
            });
        });

        it('should match allow meta-router to be used in subapp', function(done) {
            jsonRequest('/api/hello/345', 'GET', function(err, response, result) {
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

    describe('middleware using routes.json' , function() {
        before(function(done) {

            var metaRouterMiddleware = require('../middleware');
            app = express();

            app.use(metaRouterMiddleware.match(nodePath.join(__dirname, 'routes.json')));

            app.use(function(req, res, next) {
                req.matchedRoute = req.route;
                next();
            });

            app.use(metaRouterMiddleware.invokeHandler());

            app.use(function(req, res, next){
              res.send(404, 'Not Found');
            });

            app.use(function(err, req, res, next){
              console.error(err.stack);
              res.send(500, 'Server error');
            });

            server = http.createServer(app);
            server.on('listening', function() {
                port = server.address().port;
                done();
            });

            server.listen();
        });

        after(function() {
            server.close();
        });

        it('should match a route loaded from a json file', function(done) {
            jsonRequest('/users/frank', 'GET', function(err, response, result) {
                if (err) {
                    return done(err);
                }

                expect(result).to.deep.equal({
                    message: 'Hello frank!'
                });

                done();
            });
        });

        it('should match a route loaded from a json file with a method', function(done) {
            jsonRequest('/foo', 'GET', function(err, response, result) {
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

});