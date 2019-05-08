const chai = require('chai');
chai.config.includeStack = true;

const expect = require('chai').expect;
const nodePath = require('path');

describe('matcher for shorthand routes' , () => {
    it('should load a routes file', done => {
        const metaRouter = require('../');
        metaRouter.buildMatcher(nodePath.join(__dirname, 'fixtures/routes-shorthand.json'), (err, matcher) => {
            if (err) {
                return done(err);
            }

            let match = matcher.match('/users/123', 'GET');
            expect(match != null).to.equal(true);
            expect(match.params).to.deep.equal({ user: '123' });
            expect(match.config.handler).to.equal(require('./fixtures/user-with-meta'));
            expect(match.config.meta1).to.equal(true);

            match = matcher.match('/foo', 'GET');
            expect(match != null).to.equal(true);
            expect(match.config.handler != null).to.equal(true);
            expect(match.config.handler).to.equal(require('./fixtures/user-with-meta').foo);
            expect(match.config.meta2).to.equal(true);

            match = matcher.match('/bar', 'GET');
            expect(match != null).to.equal(true);
            expect(match.config.handler != null).to.equal(true);
            expect(match.config.handler).to.equal(require('./fixtures/user-with-meta').bar);
            expect(match.config.meta3).to.equal(true);
            expect(match.config.bar).to.equal(true);

            done();
        });

    });

});