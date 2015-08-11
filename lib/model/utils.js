var ObjectId = require('mongodb').ObjectID;
var PATTERNS = require('./patterns');

module.exports = function initializeUtils (Klass) {
  var utils = {
    /**
     * @Section Static utilities
     */

    /**
     * Fetch nested property value based on string
     * @param  obj
     * @param  address 'prop.prop.prop'
     * @return nested value || undefined
     */
    deepFetch: function deepFetch (obj, address) {
      var arr = address.split(".");
      while (arr.length && (obj = obj[arr.shift()])){}
      return obj;
    },

    /**
     * Get a default formatted name for a memoized method
     * @param  {String} path The property we're memoizing
     * @return {String}      The formatted getter name
     */
    embedGetterName: function embedGetterName (path) {
      return 'get' + path[0].toUpperCase() + path.slice(1);
    },

    /**
     * Transform a property name to all caps for memoization
     * @param  {String} path The property we're memoizing
     * @return {[type]}      The formatted memoized name
     */
    embedMemoizedName: function embedMemoizedName (path) {
      return path.toUpperCase();
    },

    /**
     * An escape function for crafting regular expressions from untrusted input.
     * @param  {String} reStr The string to escape with
     * @return {String}       A RE-safe string
     */
    escapeRegExp: function escapeRegExp (reStr) {
      return reStr.toString().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    },

    /**
     * Gets a two-tuple from an object and a string path, suitable for deletion or editing.
     * @param  {Object} obj  The base object, like 'req' or 'this'
     * @param  {String} path The dot-delimited path to recurse into, such as 'body.id'
     * @return {Array}       An array pair of object and last key, [{req: {body: {id: 1}}}, 'id']
     * @example
     *
     * request = {body: {id: 1}};
     * var parts = utils.getPathReferenceArray(request, 'body.id');
     * delete parts[0][parts[1]];
     * console.log(request);
     * //=> {body: {}}
     *
     * request = {};
     * var parts = utils.getPathReferenceArray(request, 'body.id', {create: true});
     * parts[0][parts[1]] = 1;
     * console.log(request);
     * //=> {body: {id: 1}}
     */
    getPathReferenceArray: function getPathReferenceArray (obj, path, options) {
      var parts = path.split('.');
      var key = parts.pop();
      if (parts.length === 0) {
        return [obj, key];
      }
      else {
        return [parts.reduce(function(accum, part, i) {
          if (options && options.create && typeof accum[part] === 'undefined') {
            accum[part] = {};
          }
          return accum[part];
        }, obj), key];
      }
    },

    /**
     * Gets a MongoDB ObjectId from the passed-in string or ObjectId
     * @private
     */
    getObjectId: function getObjectId (id) {
      try {
        return new ObjectId(id.toString());
      }
      catch (err) {
        throw new Klass.Error('id', err.toString());
      }
    },

    /**
     * Returns an existing observation context based on the supplied `as` option,
     * taking into account which contexts are defined on the model.
     * @param   {Object} options an options object defining which readable property we're querying,
     *                           and what the desired context is.
     * @return  {String}         the best available context name
     */
    getObservationContext: function getObservationContext(options) {
      options || (options = {});
      var as = options.as;
      var prop = options.prop;

      // If `prop` wasn't defined, or we used _all as the context, we can access anything.
      if (as === '_all' || (!Klass[prop])) {
        return '_all';
      }

      // Get a valid observation context, or the default.
      as || (as = 'default');
      var allowedProps = Klass[prop][as];
      if (allowedProps) {
        return as;
      }
      else {
        return 'default';
      }
    },

    /**
     * Returns true if the dot-delimited argument `prop` is nested inside
     * any of the objects described by the passed-in array of dot-delimited paths, `list`.
     * @private
     */
    isNestedInSome: function isNestedInSome (prop, list) {
      return list.some(function (base) {
        // put the prop itself into a regexp anchored to the beginning, and check it against the allowed field
        return new RegExp('^' + utils.escapeRegExp(base)).test(prop);
      });
    },

    /**
     * A handler for converting some specifically formatted strings back to
     * the objects they represent when using `JSON.parse`
     * @private
     */
    JSONReHydrationHandler: function JSONReHydrationHandler (key, value) {
      if (typeof value === 'string') {
        if (PATTERNS.OBJECTID.test(value)) {
          return utils.getObjectId(value);
        }
        else if (PATTERNS.DATE.test(value)) {
          return new Date(value);
        }
        return value;
      }
      return value;
    },

    /**
     * A no-op to be subbed in for undefined callbacks
     * @private
     */
    noop: function noop () {},

    /**
     * Normalizes query arguments, ensuring `options` is an object and `done` is defined.
     * Note: Accepts either an args array or the array-like object `arguments`
     * @private
     */
    parseQueryArgs: function parseQueryArgs (args) {
      var parsedArgs = {};
      parsedArgs.criteria = args[0];
      if (typeof args[1] === 'function') {
        parsedArgs.done = args[1];
        parsedArgs.options = {};
      }
      else if (typeof args[1] === 'undefined') {
        parsedArgs.options = {};
        if (typeof args[2] === 'undefined') {
          parsedArgs.done = utils.noop;
        }
      }
      else {
        parsedArgs.options = args[1];
        parsedArgs.done = args[2] || utils.noop;
      }
      return parsedArgs;
    },

    /**
     * Returns true if one of the dot-delimited paths in `list` is nested
     * inside an object described by the passed-in dot-delimited argument `prop`.
     * @private
     */
    someAreNestedIn: function someAreNestedIn (list, prop) {
      return list.some(function (base) {
        // put the prop itself into a regexp anchored to the beginning, and check it against the allowed field
        return new RegExp('^' + utils.escapeRegExp(prop)).test(base);
      });
    },

    /**
     * @section Instance utilities
     * Must be called with an instance as the first argument.
     */

    /**
     * Returns the current state of a model instance's data
     * Model instances store their current values in an object named `*`.
     * @private
     */
    getState: function getState(instance) {
      return instance['*'];
    },

    /**
     * Sets the current state of a model instance's data, as a JSON-compatible object
     * @private
     */
    setState: function setState (instance, properties) {
      instance['*'] = JSON.parse(JSON.stringify(properties), utils.JSONReHydrationHandler);
    },

    /**
     * Returns the current state of a model instance's persisted data
     * Model instances store a separate copy of what was last retrieved
     * from the database in  `_*`. This allows `save` queries to be generated
     * by diffing `_*` against `*`.
     * @private
     */
    getPersistedState: function getPersistedState (instance) {
      return instance['_*'];
    },

    /**
     * Sets the current state of a model instance's persisted data, as a JSON-compatible object
     * @private
     */
    setPersistedState: function setPersistedState (instance, properties) {
      instance['_*'] = JSON.parse(JSON.stringify(properties), utils.JSONReHydrationHandler);
    }
  };
  return utils;
};
