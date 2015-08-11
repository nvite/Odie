'use strict';

/**
 * @file
 * Database connection. Managed through Q.
 */

var MongoClient = require('mongodb').MongoClient;
var Q = require('q');

module.exports = function initializeConnection (Model, done) {
  var dfd = Q.defer();
  var connection;
  var uri = Model.config('uri') || 'mongodb://localhost/test';
  var options = Model.config('options') || {};
  var connectionGetter = function getConnection () {
    return global.__odiedb__ || connection;
  };
  connectionGetter.promise = dfd.promise;
  MongoClient.connect(uri, options, function (err, db) {
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
