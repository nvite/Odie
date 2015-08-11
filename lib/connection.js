'use strict';

/**
 * @file
 * Database connection. Managed through Q.
 */

var MongoClient = require('mongodb').MongoClient;
var Q = require('q');
var qs = require('querystring');

module.exports = function initializeConnection (Model, done) {
  var dfd = Q.defer();
  var connection;
  var uri = Model.config('uri') || 'mongodb://localhost/odie_test';
  var options = Model.config('options') || {};
  var connectionGetter = function getConnection () {
    return global.__odiedb__ || connection;
  };
  connectionGetter.promise = dfd.promise;
  if (Object.keys(options)) {
    uri += (/\?/.test(uri) ? '&' : '?') + qs.stringify(options);
  }
  MongoClient.connect(uri, function (err, db) {
    if (err) {
      dfd.reject(err);
      return done && done(err);
    }
    connection = db;
    dfd.resolve(connection);
    return done && done(null, connection);
  });

  return connectionGetter;
};
