var Q = require('q');
var QuerySet = require('../queryset');

module.exports = function initializeFinders (Klass) {
  var utils = require('./utils')(Klass);

  /**
   * Gets a single instance from the database
   * @param  {String}   criteria The Stringified ObjectId to fetch
   * @param  {Object}   options  Currently unused
   * @param  {Function} done     The callback `function(err, instance)` to execute when the query completes
   * @return {Promise}           A promise for a Model instance
   */
  Klass.get = function (criteria, options, done) {
    var error;
    var args = utils.parseQueryArgs(arguments);
    var dfd = Q.defer();
    var countDeferred = Q.defer();

    if (typeof args.criteria === 'string' || !Object.keys(args.criteria).length) {
      args.criteria = { _id: utils.getObjectId(args.criteria.toString()) };
    }
    var cursor = Klass.DB().collection(Klass.getCollectionName()).find(args.criteria);
    var qs = new QuerySet(cursor, Klass);
    qs.count(function (err, num) {
      if (err) {
        return countDeferred.reject(num);
      }
      countDeferred.resolve(num);
    });
    if (args.options.preload && (Array.isArray(args.options.preload) || typeof args.options.preload === 'string')) {
      Array.isArray(args.options.preload) || (args.options.preload = [args.options.preload]);
      qs.preload.apply(qs, args.options.preload);
    }
    // Grab the first instance off the cursor and return it.
    qs.next(function (err, model) {
      if (err) {
        dfd.reject(err);
        return args.done(err);
      }
      if (model === null) {
        dfd.resolve();
        return args.done(null);
      }
      countDeferred.promise.then(function (count) {
        if (count > 1) {
          error = new Klass.Error('result', '`get` returned more than one result');
          dfd.reject(error);
          return args.done(error);
        }
        dfd.resolve(model);
        return args.done(null, model);
      }).catch(function (err) {
        dfd.reject(err);
        return args.done(err);
      });
    });

    return dfd.promise;
  };

  /**
   * An alias for get
   * @type {Function}
   */
  Klass.findById = Klass.get;

  /**
   * An alias for get
   * @type {Function}
   */
  Klass.findOne = Klass.get;

  /**
   * Gets an array of instances from the database by some mongo criteria
   * @param  {Object}   criteria The MongoDB query to match
   * @param  {Object}   options  Currently unused
   * @return {Promise}           A promise for an array of model instances
   */
  Klass.find = function (criteria, options) {
    var args = utils.parseQueryArgs(arguments);
    var preloadProperties;
    if (args.options.preload && ['string', 'array'].indexOf(typeof args.options.preload) !== -1) {
      preloadProperties = args.options.preload;
      delete args.options.preload;
    }

    var cursor = Klass.DB().collection(Klass.getCollectionName()).find(args.criteria);
    return new QuerySet(cursor, Klass);
  };

  Klass.all = function (options) {
    var args = utils.parseQueryArgs(arguments);
    var preloadProperties;
    if (args.options.preload && ['string', 'array'].indexOf(typeof args.options.preload) !== -1) {
      preloadProperties = args.options.preload;
      delete args.options.preload;
    }

    var cursor = Klass.DB().collection(Klass.getCollectionName()).find({});
    return new QuerySet(cursor, Klass);
  };

  /**
   * Fetches a single model instance from the database if it exists, or initializes a new unpersisted instance if it doesn't
   * @param  {Object}   criteria The MongoDB query to match
   * @param  {Object}   options  An options hash by which the key `defaults` can be used to provide default values for new instances
   * @param  {Function} done     The callback `function(err, instance)` to execute when the query completes
   * @return {Promise}           A promise for a model instance
   */
  Klass.getOrInitialize = function (criteria, options, done) {
    var args = utils.parseQueryArgs(arguments);
    var defaults = args.options.defaults || {};
    delete args.options.defaults;

    var dfd = Q.defer();

    Klass.get(args.criteria, args.options, function (err, result) {
      if (err) {
        dfd.reject(err);
        return args.done(err);
      }
      else if (result) {
        dfd.resolve(result);
        return args.done(null, result);
      }
      var instance = new Klass(defaults);
      dfd.resolve(instance);
      return args.done(null, instance);
    });

    return dfd.promise;
  };
};
