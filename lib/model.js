'use strict';

/**
 * @module lib/model
 * @description An abstract model decorator.
 * Injects class and instance methods into a constructor to grant it model-like behavior.
 * @param {Function} Klass          The model ctor object to inject
 * @param {String}   collectionName The name of the database collection this model persists to
 */
function Model (Klass, collectionName) {
  // set our collection name on this model class
  Klass.COLLECTION_NAME = collectionName;

  // initialize a db connection for this class
  if (global.__odiedb__) {
    Klass.DB = function () {
      return global.__odiedb__;
    };
  }
  else {
    Klass.DB = require('./connection')(Model);
  }

  // initialize our model methods
  require('./model/base')(Klass, collectionName);
  require('./model/errors')(Klass);
  require('./model/finders')(Klass);
  require('./model/manipulators')(Klass);
  require('./model/persistence')(Klass);
  require('./model/attributes/accessors')(Klass);
  require('./model/attributes/memoizers')(Klass);
  require('./model/attributes/overrides')(Klass);
  require('./model/attributes/validators')(Klass);
}

// make our Model decorator configurable
require('./configuration')(Model);

module.exports = Model;
