'use strict';

var Q = require('q');

var logger = require('./log');

/**
 * Wraps a MongoDB Cursor with preloader and hydrator methods to return Model instances.
 * @param {[type]} cursor A MongoDB cursor
 * @param {[type]} klass  A model class to instantiate
 */
function QuerySet(cursor, klass) {
  this._cursor = cursor;
  this._finalErrorHandler = function(){};
  this._hydrationHandler = klass.hydrate;
  this._preloadHandler = klass.preload;
  this._preloadList = [];
  this._klass = klass;
}

/**
 * Delegated methods directly to the cursor
 * @return {QuerySet} The QuerySet instance the method was called on
 */
['hint', 'batchSize', 'limit', 'skip', 'sort', 'count', 'rewind', 'explain'].forEach(function (name) {
  QuerySet.prototype[name] = function () {
    if (this._cursor[name]) {
      this._cursor[name].apply(this._cursor, arguments);
    }
    else {
      var err = new this._klass.Error('deprecation', 'MongoDB Cursor method "' + name + '" does not exist!');
      logger().warn('[' + err.name + ']', err.message, err.stack);
    }
    return this;
  };
});

/**
 * Formats a QuerySet instance for the REPL
 * @return {String} A formatted string of the instance
 */
QuerySet.prototype.inspect = function () {
  return '<QuerySet: ' + this._klass.getClassName() + '>';
};

/**
 * Iterates over a cursor, yielding Model instances
 * @param  {Function} callback The callback `(err, model)` to execute
 * @return {QuerySet}          The QuerySet instance the method was called on
 */
QuerySet.prototype.forEach = function (callback) {
  this._cursor.each(function (err, record) {
    if (err) {
      return callback.call(null, err);
    }
    if (record === null) {
      return this;
    }
    return this._handleSingleRecord(record, callback);
  }.bind(this));
  return this;
};

/**
 * Converts a cursor into an array of Model instances
 * @param  {Function} callback The callback `(err, ModelArray)` to execute
 * @return {QuerySet}          The QuerySet instance the method was called on
 */
QuerySet.prototype.toArray = function (callback) {
  this._cursor.toArray(function (err, records) {
    var chain = Q.fcall(function () {});
    var out = records;
    if (err) {
      return callback(err);
    }
    out.forEach(function (item, i) {
      chain = chain.then(function () {
        var dfd = Q.defer();
        this._handleSingleRecord(item, function (err, hydrated) {
          if (err) {
            return dfd.reject(err);
          }
          out[i] = hydrated;
          dfd.resolve();
        });
        return dfd.promise;
      }.bind(this));
    }.bind(this));
    chain.then(function () {
      return callback.call(null, null, out);
    }).catch(function (err) {
      return callback.call(null, err);
    });
  }.bind(this));
  return this;
};

QuerySet.prototype.toJSON = function (formatOptions, callback) {
  if (typeof formatOptions === 'function') {
    callback = formatOptions;
    formatOptions = null;
  }
  formatOptions || (formatOptions = {});
  this.toArray(function (err, records) {
    if (err) {
      return callback.call(null, err);
    }
    return callback.call(null, null, records.map(function (record) {
      return record.format(formatOptions);
    }));
  });
  return this;
};

/**
 * Yields one model instance from the cursor
 * @param  {Function} callback The callback `(err, record)` to execute
 * @return {QuerySet}          The QuerySet instance the method was called on
 */
QuerySet.prototype.next = function (callback) {
  this._cursor.nextObject(function (err, record) {
    if (err) {
      return callback.call(null, err);
    }
    if (record === null) {
      return callback.call(null, null, null);
    }
    return this._handleSingleRecord(record, callback);
  }.bind(this));
  return this;
};

/**
 * Converts a cursor into an array of Model instances, with a promise-like interface
 * @param  {Function} callback The callback `(record)` to execute
 * @return {QuerySet}          The QuerySet instance the method was called on
 *
 * Note: toArray should always call back in the next tick, so then().catch()
 * should never leave an undefined error handler, even though we don't have real
 * promises here.
 */
QuerySet.prototype.then = function (callback) {
  this.toArray(function (err, records) {
    var func;
    if (err) {
      func = this._finalErrorHandler;
      delete this._finalErrorHandler;
      return func(err);
    }
    return callback(records);
  }.bind(this));
  return this;
};

/**
 * Registers an error handler to be called on failure of `then`
 * @param  {Function} callback The function `(err)` to execute on error
 * @return {QuerySet}          The QuerySet instance the method was called on
 */
QuerySet.prototype.catch = function (callback) {
  this._finalErrorHandler = callback;
  return this;
};

/**
 * Registers preloadable methods to be called when instantiating a Model, via `Klass.preload`
 * @param  {Array|String...}  methods  A splat of method names to preload
 * @return {QuerySet}                  The QuerySet instance the method was called on
 */
QuerySet.prototype.preload = function () {
  if (Array.isArray(arguments[0])) {
    this._preloadList = arguments[0];
  }
  else {
    this._preloadList = Array.prototype.slice.call(arguments);
  }
  return this;
};

/**
 * Manages hydration and preloading of a single record from the database
 * @private
 */
QuerySet.prototype._handleSingleRecord = function (record, callback) {
  // hydrate models
  return this._hydrate(record, function (err, model) {
    if (err) {
      return callback(err);
    }
    // and preload any items we asked for
    if (this._preloadList.length && this._preloadHandler) {
      return this._preloadHandler(model, this._preloadList, function (err){
        return callback(err, model);
      });
    }
    return callback(null, model);
  }.bind(this));
};

/**
 * Manages hydration of a single record from the database
 * @private
 */
QuerySet.prototype._hydrate = function (instance, callback) {
  return this._hydrationHandler ?
         this._hydrationHandler.call(null, instance, callback) :
         callback.call(null, null, instance);
};

module.exports = QuerySet;
