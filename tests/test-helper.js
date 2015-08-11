/**
 * @file test-helper.js
 * Setup to be required into all test files.
 * This file puts the necessary bootstrap stuff into globals for prettier-looking tests.
 * just `require('./path/to/test_helper')` get set up.
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

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

GLOBAL.assert = require('assert');
GLOBAL.should = require('should');
GLOBAL.assertAsync = asyncFailureHandler;
