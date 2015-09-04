/**
 * @file test-helper.js
 * Setup to be required into all test files.
 * This file puts the necessary bootstrap stuff into globals for prettier-looking tests.
 * just `require('./path/to/test_helper')` get set up.
 */

var MongoClient = require('mongodb').MongoClient;

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

/**
 * Init & share a db connection
 */
before(function (done) {
  var db_uri = 'mongodb://localhost:27017/odie_test';
  MongoClient.connect(db_uri, function (err, db) {
    if (err) {
      return done(err);
    }
    global.__odiedb__ = db;
    done();
  });
});

/**
 * Provide an async failure handler for mocha
 */
var asyncFailureHandler = function (done, func) {
  try {
    func();
  }
  catch (err) {
    done(err);
  }
};

/**
 * Export some nasty globals for use in our tests
 */

global.assert = require('assert');
global.should = require('should');
global.assertAsync = asyncFailureHandler;
