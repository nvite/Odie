var Q = require('q');
var logger = require('../log');

module.exports = function initialize(Klass) {
  var utils = require('./utils')(Klass);

  /** @section instance methods */

  /**
   * Returns the name of the constructor function that was passed in, i.e., 'User'
   * @return {String} The class name
   */
  Klass.prototype.getClassName = function () {
    return Klass.name;
  };

  /**
   * Returns the database collection name that the model was instantiated with, i.e., 'users'
   * @return {String}  The collection name
   */
  Klass.prototype.getCollectionName = function () {
    return Klass.COLLECTION_NAME;
  };

  /**
   * Boils the model's internal state down to a set of safe-to-display
   * properties based on the observer's context
   * @param  {Object} options             An object containing options which may dictate aspects of this method's behavior:
   *                                        - {Object}  data  Optional source data to use instead of the unpersisted state.
   *                                        - {String}  as    The relationship of the actor to the object.
   * @return {Object}                     The formatted representation of the model.
   */
  Klass.prototype.format = function (options) {
    options || (options = {});
    // Get our data from the unpersisted state
    var source = options.data || JSON.parse(JSON.stringify(utils.getState(this)));

    // If the model doesn't define readables, return the full source
    if (!Klass.READABLE_PROPERTIES) {
      return source;
    }

    var observationContext = options.as;

    // If observationContext wasn't provided, or isn't defined in the model, let's use the default
    if (!Klass.READABLE_PROPERTIES[observationContext] && observationContext !== '_all') {
      logger().info('Observation context "' + observationContext + '" is not defined by `' + this.getClassName() + '`, returning default properties.');
      observationContext = 'default';
    }
    // If even a default wasn't provided, just return everything
    if (!Klass.READABLE_PROPERTIES[observationContext]) {
      return source;
    }

    // Iterate over the readable properties for our observationContext and accumulate them
    // on a return object
    var data =  Klass.READABLE_PROPERTIES[observationContext].reduce(function (out, prop) {
      // properties like `foo.$.bar` mean that we want to keep this property across an array of objects
      if (prop.indexOf('.$.') !== -1) {
        var propParts = prop.split('.$.');
        if (propParts.length > 2) {
          throw new Klass.Error('attribute', 'Double-nesting of format iterators is not supported.');
        }
        var arrayRefs = utils.getPathReferenceArray(out, propParts[0], {create: true});
        (utils.deepFetch(source, propParts[0]) || []).forEach(function (sourceItem, i) {
          var value = utils.deepFetch(sourceItem, propParts[1]);
          if (typeof value === 'undefined') { return; }
          arrayRefs[0][arrayRefs[1]] || (arrayRefs[0][arrayRefs[1]] = []);
          arrayRefs[0][arrayRefs[1]][i] || (arrayRefs[0][arrayRefs[1]][i] = {});
          var refs = utils.getPathReferenceArray(arrayRefs[0][arrayRefs[1]][i], propParts[1], {create: true});
          refs[0][refs[1]] = value;
        });
        return out;
      }
      // all other properties can be filtered normally
      else {
        var value = utils.deepFetch(source, prop);
        // continue if this was undefined
        if (typeof value === 'undefined') {
          return out;
        }
        // scaffold our destination object to set the value on now that we know it's in the source
        var refs = utils.getPathReferenceArray(out, prop, {create: true});

        // last, assign out and return
        refs[0][refs[1]] = value;
        return out;
      }
    }, {});
    // we rehydrate our native objects (ObjectIds, Dates) by default, they stringify just fine
    if (options.rehydrate !== false) {
      data = JSON.parse(JSON.stringify(data), utils.JSONReHydrationHandler);
    }
    return data;
  };


  /**
   * Define a string representation for the console
   * @return {String}
   */
  Klass.prototype.inspect = function () {
    // have we defined a custom `toString` for this model? Let's append it if so
    var repr = this.toString() === '[object Object]' ? this.get('_id').toString() :  this.toString();
    return "<" + this.getClassName() + ": " + repr + ">";
  };

  /**
   * Implicit formatter for conversion to JSON via JSON.stringify
   * @return {Object} A JSON-serializable object suitable for return to a browser
   */
  Klass.prototype.toJSON = function () {
    // we don't alias this directly because we want to make sure it implements any overrides mixed in later
    return this.format();
  };

  /**
   * Sets the initial internal state of a model instance.
   * Called by the implementing model's constructor.
   * @param  {Object} context    The native object that holds our data
   * @return {Void}
   */
  Klass.prototype.initializeWith = function (context) {
    utils.setState(this, context);
    return utils.getState(this);
  };

  /** @section class methods */

  /**
   * Returns the name of the constructor function that was passed in, i.e., 'User'
   * @return {String} The class name
   */
  Klass.getClassName = function () {
    return this.name;
  };

  /**
   * Returns the database collection name that the model was instantiated with, i.e., 'users'
   * @return {String}  The collection name
   */
  Klass.getCollectionName = function () {
    return this.COLLECTION_NAME;
  };

  /**
   * Transforms a single MongoDb result into a model instance
   * @private
   */
  Klass.hydrate = function (instance, callback) {
    try {
      var model = new Klass(instance);
      utils.setPersistedState(model, instance);
      callback(null, model);
    }
    catch (err) {
      callback(err);
    }
  };

  /**
   * Preloads specified fields for an array of model instances
   * @private
   */
  Klass.preload = function (instance, properties, callback) {
    if (typeof properties === 'string') {
      properties = [properties];
    }
    var chain = Q.fcall(function () {});
    properties.forEach(function (prop) {
      if (typeof instance[prop] !== 'function') {
        if (typeof instance[utils.embedGetterName(prop)] === 'function') {
          chain = chain.then(instance[utils.embedGetterName(prop)].bind(instance));
        }
      }
      else {
        chain = chain.then(instance[prop].bind(instance));
      }
    });
    chain.then(function () {
      callback(null);
    }).catch(function (err) {
      callback(err);
    });
  };
};
