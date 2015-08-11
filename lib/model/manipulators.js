module.exports = function initializeManipulators (Klass) {
  var utils = require('./utils')(Klass);

  /**
   * Gets an arbitrarily nested property from the model
   * @param  {String} property The property path to get, dot-delimited
   * @param  {Mixed} def       The default to return if undefined
   * @return {Mixed}           The fetched value
   */
  Klass.prototype.get = function (property, def) {
    if (typeof property === 'undefined') {
      return utils.getState(this);
    }
    var actualValue = utils.deepFetch(utils.getState(this), property);

    return typeof actualValue === 'undefined' ?
      def :
      actualValue;
  };

  /**
   * Sets an arbitrarily nested property from the model
   * @param  {String} property The property path to set, dot-delimited
   * @param  {Mixed}  value    The value to set `property` to
   * @return {Mixed}           The new value
   */
  Klass.prototype.set = function (property, value) {
    if (typeof property !== 'string') {
      throw new Klass.Error('argument', '`set` must be called with the signature `property, value`!');
    }
    var ref = utils.getPathReferenceArray(utils.getState(this), property, {create: true});

    return ref[0][ref[1]] = value;
  };

  /**
   * Unsets an arbitrarily nested property from the model
   * @param  {String} property The property path to unset, dot-delimited
   * @return {Boolean}         Returns true
   */
  Klass.prototype.unset = function (property) {
    if (typeof property !== 'string') {
      throw new Klass.Error('argument', '`unset` must be called with the signature `property`!');
    }
    var ref = utils.getPathReferenceArray(utils.getState(this), property);

    return delete ref[0][ref[1]];
  };

  /**
   * Pushes a value onto the end of an array arbitrarily nested within the model
   * @param  {String} property The path to the array, dot-delimited
   * @param  {Mixed}  value    The value to push
   * @return {Number}          The new length of the array
   */
  Klass.prototype.push = function (property, value) {
    var ref = utils.getPathReferenceArray(utils.getState(this), property, {create: true});
    // initialize the reference to an array if it's undefined
    if (typeof(ref[0][ref[1]]) === 'undefined') {
      ref[0][ref[1]] = [];
    }
    if (!Array.isArray(ref[0][ref[1]])) {
      throw new Klass.Error('attribute', property + ' is not an Array!');
    }

    return ref[0][ref[1]].push(value);
  };

  /**
   * Unshifts a value onto the beginning of an array arbitrarily nested within the model
   * @param  {String} property The path to the array, dot-delimited
   * @param  {Mixed} value     The value to unshift
   * @return {Number}          The new length of the array
   */
  Klass.prototype.unshift = function (property, value) {
    var ref = utils.getPathReferenceArray(utils.getState(this), property, {create: true});
    // initialize the reference to an array if it's undefined
    if (typeof(ref[0][ref[1]]) === 'undefined') {
      ref[0][ref[1]] = [];
    }
    if (!Array.isArray(ref[0][ref[1]])) {
      throw new Klass.Error('attribute', property + ' is not an Array!');
    }

    return ref[0][ref[1]].unshift(value);
  };

  /**
   * Splices a value out of an array arbitrarily nested within the model
   * @param  {String} property The path to the array, dot-delimited
   * @param  {Number} index    The start index of the splice
   * @param  {Number} length   The length of the splice
   * @return {Array}           The spliced values
   */
  Klass.prototype.splice = function (property, index, length) {
    var ref = utils.getPathReferenceArray(utils.getState(this), property);
    if (!Array.isArray(ref[0][ref[1]])) {
      throw new Klass.Error('attribute', property + ' is not an Array!');
    }

    return ref[0][ref[1]].splice(index, length);
  };

  /**
   * Resets the model's data to the last persisted state
   * @param  {String} path    An optional dot-delimited path to a property
   *                          to reset the value for
   * @param  {Object} options Currently unused
   * @return {Void}
   */
  Klass.prototype.reset = function (path, options) {
    if (typeof path === 'object') {
      options = path;
      path = null;
    }

    if (path) {
      return this.set(path, utils.deepFetch(utils.getPersistedState(this) || {}, path));
    }
    else {
      return utils.setState(this, utils.getPersistedState(this) || {});
    }
  };
};
