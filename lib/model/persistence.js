var Q = require('q');
var ObjectId = require('mongodb').ObjectID;
var flatten = require('flat');
var deepDiff = require('deep-diff');
var MySet = require('collections/set');

module.exports = function initializePersistence (Klass) {
  var utils = require('./utils')(Klass);

  /** @section instance methods */

  /**
   * Gets a flat list of dot-delimited fields that have been changed since the last save operation
   * @return {Array} A list of changed fields, like 'foo.bar.baz'
   */
  Klass.prototype.dirtyFields = function () {
    return getChangedFields(this);
  };

  /**
   * Returns a boolean value of whether the model has unpersisted changes
   * @param  {String}  path  An optional dot-delimited path to a property
   *                             to check the dirty state of
   * @param  {Object}  options   Currently unused
   * @return {Boolean}         Whether the model has unpersisted changes
   */
  Klass.prototype.isDirty = function (path, options) {
    if (typeof path === 'object') {
      options = path;
      path = null;
    }
    if (path) {
      // we compare values as strings in case the path points to an object/date/objectID
      return JSON.stringify(this.get(path)) !== JSON.stringify(utils.deepFetch(utils.getPersistedState(this) || {}, path));
    }

    return !!getChangeSet(this);
  };

  /**
   * Returns a boolean value of whether the model is a new, unpersisted instance
   * @return {Boolean} Whether the instance has ever been saved or not
   */
  Klass.prototype.isNew = function () {
    return !utils.getPersistedState(this);
  };

  /**
   * Reloads the model's data from the database
   * @param  {Object}   options Currently unused
   * @param  {Function} done    An optional callback to run once the data is fetched
   * @return {Promise}          A promise for the (Void) completed reload operation
   */
  Klass.prototype.reload = function (options, done) {
    var args = utils.parseQueryArgs([null, options, done]);
    var original = utils.getPersistedState(this) || {};
    var dfd = Q.defer();

    // If there is no previously saved record, we can't reload; let's keep moving.
    if (this.isNew()) {
      dfd.resolve();
      return dfd.promise;
    }

    Klass
      .get(original._id).then(function (instance) {
        utils.setState(this, instance.get());
        utils.setPersistedState(this, instance.get());
        dfd.resolve();
        args.done();
      }.bind(this))
      .catch(function (err) {
        dfd.reject(err);
        args.done(err);
      });

    return dfd.promise;
  };

  /**
   * Persists any changes to the model's data down to storage
   * @param  {Object}   options Options to augment the save behavior, currently:
   *                              - clean: set to `false` to skip pruning disallowed fields from the update operation
   *                              - validate: set to `false` to skip validation
   * @param  {Function} done    An optional callback to be executed when the save has completed
   * @return {Promise}          A promise for the saved document's ID
   */
  Klass.prototype.save = function (options, done) {
    var dfd = Q.defer();
    var original = utils.getPersistedState(this) || {};
    var ts = new Date();

    // parse our query args now to ensure we have a callback for validation
    var args = utils.parseQueryArgs([null, options, done]);

    // validate the model
    if (this.validate && args.options.validate !== false) {
      var errors = this.validate();
      if (errors.length) {
        var err = new Klass.Error('validation', 'Validation failed');
        err.fields = errors;
        dfd.reject(err);
        args.done(err);
        return dfd.promise;
      }
    }

    // prune any properties that shouldn't be persisted
    if (args.options.clean !== false) {
      this.clean({as: args.options.as});
    }

    // we passed validation, let's go ahead and persist
    this.set('updated_at', ts);

    // let's insert if this is a new record
    if (this.isNew()) {
      this.set('created_at', ts);
      insertRecord(utils.getState(this), function (err, newRecords) {
        if (err || (!newRecords.length)) {
          dfd.reject(err);
          return args.done(err);
        }
        utils.setPersistedState(this, newRecords[0]);
        utils.setState(this, newRecords[0]);
        dfd.resolve(newRecords[0]._id);
        return args.done(null, newRecords[0]._id);
      }.bind(this));
    }

    // otherwise let's update
    else {
      args.criteria = { _id: new ObjectId(original._id.toString()) };
      var updateQuery = getUpdateQuery(this);
      // if there's no query we can resolve immediately
      if (!updateQuery) {
        dfd.resolve(this.get('_id'));
        args.done(null, this.get('_id'));
        return dfd.promise;
      }

      updateRecord(args.criteria, updateQuery, function (err, numUpdated) {
        if (err || (!numUpdated)) {
          dfd.reject(err);
          return args.done(err);
        }

        // If it worked, let's reload from the db to make sure we have the right data.
        this.reload()
          .then(function () {
            dfd.resolve(this.get('_id'));
            return args.done(null, this.get('_id'));
          }.bind(this))
          .catch(function (err) {
            dfd.reject(err);
          });
      }.bind(this));
    }

    return dfd.promise;
  };

  /**
   * Updates the model's data by merging the passed-in object.
   * Calls `save` behind the scenes, invoking clean/validate, and any overrides or callbacks associated.
   * @param  {Object}   data      The data object to merge in
   * @param  {Object}   options   Options for the update, including `as` which will be passed along to save/clean.
   * @param  {Function} done      An optional callback to be executed when the save has completed
   * @return {Promise}            A promise for the saved documents' ID
   */
  Klass.prototype.updateWith = function (data, options, done) {
    var args = utils.parseQueryArgs(arguments);
    var dfd = Q.defer();

    Object.keys(flatten(args.criteria)).forEach(function (prop) {
      // we can get properties from the context that look like {'foo.bar': 'blah'}
      // or like {foo: {bar: 'blah'}}
      this.set(prop, args.criteria[prop] || utils.deepFetch(args.criteria, prop));
    }.bind(this));

    this.save(args.options)
      .then(function (id) {
        dfd.resolve(id);
        return args.done(null, id);
      })
      .catch(function (err) {
        dfd.reject(err);
        return args.done(err);
      });

    return dfd.promise;
  };

  /**
   * Directly updates the model with the passed-in object, without invoking the model's save method.
   * This means it skips cleaning, validation, any callbacks, or custom methods implemented in the model
   * code itself. It also does not reload the model, so it should only be used internally by
   * the API to do isolated writes.
   *
   * @param  {Object}   context The object to use to update the model. This performs a $set update by default,
   *                            but will also apply other $operators if provided. Any undecorated properties will
   *                            be $set.
   * @param  {Function} done    An optional callback to be executed when the save has completed.
   * @return {Promise}          A promise for the saved documents' ID
   */
  Klass.prototype.directUpdateWith = function (context, done) {
    var args = utils.parseQueryArgs([context, {}, done]);
    var dfd = Q.defer();
    var query = {$set: {}};

    // Anything with an explicit $command is passed through, everything else gets $set
    Object.keys(args.criteria).forEach(function (prop) {
      if (/^\$/.test(prop)) {
        query[prop] = args.criteria[prop];
      }
      else {
        query.$set[prop] = args.criteria[prop];
      }
    });

    // We must remove the '$set' key if there's nothing in it, otherwise mongo will ignore our query.
    // Really, it will.
    if (!Object.keys(query.$set).length) {
      delete query.$set;
    }

    updateRecord({_id: this.get('_id')}, query, function (err, numUpdated) {
      if (err || !numUpdated) {
        err || (err = new Klass.Error("query", "No records were found matching that ID."));
        dfd.reject(err);
        return args.done(err);
      }
      this.reload()
        .then(function () {
          dfd.resolve(this.get('_id'));
          return args.done(null, this.get('_id'));
        }.bind(this))
        .catch(function (err) {
          dfd.reject(err);
          return args.done(err);
        });
    }.bind(this));

    return dfd.promise;
  };

  Klass.prototype.destroy = function (done) {
    done || (done = function () {});
    var dfd = Q.defer();

    // parse our query args now to ensure we have a callback for validation
    var id = (utils.getPersistedState(this) || {})._id;

    // If this instance isn't saved, return success immediately
    if (this.isNew()) {
      dfd.resolve();
      done();
      return dfd.promise;
    }

    // If this instance is saved but doesn't have an id, return an error
    if (!id) {
      var err = new Klass.Error('value', this.inspect() + ' has no id!');
      dfd.reject(err);
      done(err);
      return dfd.promise;
    }

    deleteRecord({_id: utils.getObjectId(id)}, function (err) {
      if (err) {
        dfd.reject(err);
        return done(err);
      }
      dfd.resolve();
      return done();
    });

    return dfd.promise;
  };

  /** @section class methods */

  /**
   * Creates a new model instance and persists it immediately.
   * @param  {Object}   properties The properties to set on the model instance
   * @param  {Object}   options    Options to be passed to `instance.save()`
   * @param  {Function} done       The callback `function(err, instance)` to execute when the save completes
   * @return {Promise}             A promise for a model instance
   */
  Klass.create = function (properties, options, done) {
    if (typeof options === 'function') {
      done = options;
      options = {};
    }
    done || (done = function () {});
    var dfd = Q.defer();
    var instance = new Klass(properties);
    instance.save(options).then(function (id) {
      dfd.resolve(instance);
      return done(null, instance);
    }).catch(function (err) {
      dfd.reject(err);
      return done(err);
    });

    return dfd.promise;
  };

  /**
   * Fetches a single model instance from the database if it exists, or creates a new persisted instance if it doesn't
   * @param  {Object}   criteria The MongoDB query to match
   * @param  {Object}   options  Currently unused
   * @param  {Function} done     The callback `function(err, instance)` to execute when the query completes
   * @return {Promise}           A promise for a persisted model instance
   */
  Klass.getOrCreate = function (criteria, options, done) {
    var args = utils.parseQueryArgs(arguments);
    var dfd = Q.defer();
    Klass.getOrInitialize(args.criteria, args.options, function(err, instance) {
      if (err) {
        dfd.reject(err);
        return args.done(err);
      }
      if (instance.isDirty()) {
        instance.save(args.options, function (err, result) {
          if (err) {
            dfd.reject(err);
            return args.done(err);
          }
          else {
            dfd.resolve(instance);
            return args.done(null, instance);
          }
        });
      }
      else {
        dfd.resolve(instance);
        return args.done(null, instance);
      }
    });

    return dfd.promise;
  };

  /** @section private */

  /**
   * Deletes an existing record from the database by given criteria
   * @private
   */
  function deleteRecord(criteria, done) {
    Klass.DB().collection(Klass.getCollectionName()).remove(criteria, {single: true}, function (err, result) {
      if (err) {
        return done(new Klass.Error('persistence', err.toString()));
      }
      return done();
    });
  }

  /**
   * Inserts a new record into the database
   * @private
   */
  function insertRecord (data, done) {
    Klass.DB().collection(Klass.getCollectionName()).insert(data, {safe: true, new: true}, function (err, newRecord) {
      if (err || !newRecord) {
        return done(new Klass.Error('persistence', err ? err.toString() : newRecord));
      }
      return done(null, newRecord);
    });
  }

  /**
   * Updates an existing record in the database by given criteria
   * @private
   */
  function updateRecord (criteria, query, done) {
    Klass.DB().collection(Klass.getCollectionName()).update(criteria, query, function (err, numUpdated, status) {
      if (err || numUpdated < 1) {
        return done(new Klass.Error('persistence', err ? err.toString() : numUpdated + " records updated!"));
      }
      return done(null, numUpdated);
    });
  }

  /**
   * Returns an array of differences between the persisted model data and the current model data
   * @private
   */
  function getChangeSet (instance) {
    var changeset = deepDiff.diff(utils.getPersistedState(instance) || {}, utils.getState(instance));
    return changeset;
  }

  /**
   * Gets a flattened list of changed fields in `this`
   */
  function getChangedFields (instance) {
    var changeSet = getChangeSet(instance) || [];
    var props = changeSet.reduce(function (accum, change) {
      // Distill the ultimate path(s) from path + rhs if rhs is an object, or just path if not.
      // This clause handles array changes because typeof rhs is `undefined`
      if (typeof change.rhs !== 'object' || Object.keys(change.rhs).length === 0) {
        accum[change.path.join('.')] = 1;
      }
      // For object changes, we have to look at both right-hand and left-hand sides to get the changed paths
      else {
        Object.keys(flatten(change.rhs)).forEach(function (suffix) {
          accum[change.path.join('.') + '.' + suffix] = 1;
        });
        if (typeof change.lhs === 'object' && Object.keys(change.lhs).length) {
          Object.keys(flatten(change.lhs)).forEach(function (suffix) {
            accum[change.path.join('.') + '.' + suffix] = 1;
          });
        }
      }
      return accum;
    }, {});

    // Let's filter any keys that are nested in another present key.
    // this happens specifically when items are removed from an array,
    // for example you might otherwise get something like `['foo.2', 'foo.3', foo]`
    // This transformation returns just `['foo']` in such a case.
    // Edits that don't shorten the array will still return indexed paths.
    props = Object.keys(props);
    return props.filter(function (prop, i) {
      return !utils.isNestedInSome(prop, props.filter(function (myprop) { return prop !== myprop; }));
    });
  }

  /**
   * Returns a MongoDB update query to save this model
   * @private
   */
  function getUpdateQuery (instance, options) {
    var changeset = getChangeSet(instance);
    if (typeof changeset === 'undefined') {
      return;
    }
    var arrayPaths = new MySet();
    var updateQuery = {$set: {}};

    changeset.forEach(function (change) {
      // New or edited paths: let's set these to whatever the right-hand side is
      if (['N', 'E'].indexOf(change.kind) !== -1) {
        updateQuery.$set[change.path.join('.')] = change.rhs;
      }

      // Array changes: let's replace the source array wholesale.
      // We can add the path to a set and get the value later from `this.get`
      // Note that this type of change won't occur every time an array is edited,
      // but that's ok--we can make in-place updates by index. When the array is shortened
      // we'll see this type of change and it will trigger a full replacement,
      // which is the only single-query way to shorten an array without $pulling by value.
      if (change.kind === 'A') {
        arrayPaths.add(change.path.join('.'));
      }

      if (change.kind === 'D') {
        (updateQuery.$unset || (updateQuery.$unset = {}))[change.path.join('.')] = '';
      }
    });

    if (arrayPaths.length) {
      // @Note: we don't deal with subqueries like $addToSet or $push here, because we
      // don't incorporate constructs for creating them. If code changes such that
      // we do, more operators will need to be added.
      arrayPaths.toArray().forEach(function (path) {
        var testPattern = new RegExp('^' + utils.escapeRegExp(path) + '\\.[\\d]+');
        // make sure we don't keep any edits that were already queued for this array
        ['$set', '$unset'].forEach(function (operator) {
          Object.keys(updateQuery[operator] || {}).forEach(function(key) {
            if (testPattern.test(key)) {
              delete (updateQuery[operator][key]);
            }
          });
          // clean up the subquery if it is left empty
          if (updateQuery[operator] && Object.keys(updateQuery[operator]).length === 0) {
            delete (updateQuery[operator]);
          }
        });
        // set the entire array from the working copy
        updateQuery.$set[path] = instance.get(path);
      });
    }

    return updateQuery;
  }
};
