var MySet = require('collections/set');
var logger = require('../../log');

module.exports = function initializeAccessors (Klass) {
  var utils = require('../utils')(Klass);

  /** @section instance methods */

  /**
   * Returns a boolean value of whether or not the current observer can write the given property
   * @param  {String} property The property name to test
   * @param  {Object} options  An options object, currently supporting `as`
   * @return {Boolean}         Whether the property is writable
   */
  Klass.prototype.canWrite = function (property, options) {
    options || (options = {});
    var observationContext = utils.getObservationContext({as: options.as, prop: 'WRITABLE_PROPERTIES'});

    // if we got back '_all' we can write anything
    if (observationContext === '_all') {
      return true;
    }
    // otherwise let's check our writable properties for this property. If the context isn't defined by our model, nothing is writable.
    var allowedProps = Klass.WRITABLE_PROPERTIES[observationContext] || [];

    // last, check to see if our property is nested inside a field we allow (this also returns true on equality)...
    return utils.isNestedInSome(property, allowedProps);
  };

  /**
   * Removes properties from the model that shouldn't be persisted
   * @param  {Object} options            an object with keys including:
   *                                     - `as`: The relationship of the actor to the object
   * @return {Void}
   */
  Klass.prototype.clean = function (options) {
    options || (options = {});
    var ctx = utils.getObservationContext({as: options.as, prop: 'WRITABLE_PROPERTIES'});
    // If we asked for _all or got it back because there's no defined prop list, we can write anything
    if (ctx === '_all') {
      return;
    }

    this.dirtyFields().forEach(function (field) {
      // move on if we can write...
      if (this.canWrite(field, {as: ctx})) {
        return;
      }

      // ...if not, let's get the 'divergence point' so we know which property to roll back
      var allowedProps = Klass.WRITABLE_PROPERTIES[ctx];
      var parts = field.split('.');
      var initial = parts.shift();
      var lcd = parts.reduce(function (accum, part) {
        // if the old accumulator was nested, append the new part, we want to be one step ahead.
        if (utils.someAreNestedIn(allowedProps, accum)) {
          return [accum, part].join('.');
        }
        // otherwise return the old accumulator, we're at a stopping point.
        return accum;
      }, initial);

      // If we get this far, we need to roll back this change.
      logger().info("Setting a value for `" + lcd + "` is disallowed, rolling it back.");
      this.reset(lcd);
      // we can just delete it if resetting leaves us with an undefined value.
      if (typeof this.get(lcd) === 'undefined') {
        this.unset(lcd);
      }
    }.bind(this));
  };

  /** @section class methods */

  /**
   * Sets a property or array of properties as readable to the given context
   * @param  {String} context      An optional string name of the context in which the propert(ies) are readable
   * @param  {Mixed}  properties   A string or array of strings representing the property names that are readable
   * @return {Void}
   */
  Klass.readable = function (context, properties) {
    if (arguments.length === 1) {
      properties = context;
      context = 'default';
    }
    var refArr = utils.getPathReferenceArray(Klass, 'READABLE_PROPERTIES.' + context, {create: true});
    refArr[0][refArr[1]] || (refArr[0][refArr[1]] = []);
    // we use a Set to dedupe properties. We also concat _id on each set to make sure the _id is always readable.
    refArr[0][refArr[1]] = new MySet(refArr[0][refArr[1]].concat(properties)).concat(['_id']).toArray();
  };

  /**
   * Sets a property or array of properties as writable to the given context
   * @param  {String} context      An optional string name of the context in which the propert(ies) are writable
   * @param  {Mixed}  properties   A string or array of strings representing the property names that are writable
   * @return {Void}
   */
  Klass.writable = function (context, properties) {
    if (arguments.length === 1) {
      properties = context;
      context = 'default';
    }
    var refArr = utils.getPathReferenceArray(Klass, 'WRITABLE_PROPERTIES.' + context, {create: true});
    refArr[0][refArr[1]] || (refArr[0][refArr[1]] = []);
    // we use a Set to dedupe properties.
    refArr[0][refArr[1]] = new MySet(refArr[0][refArr[1]].concat(properties)).toArray();
  };

  /**
   * A shorthand for setting `readable` and `writable` in one call
   * @param  {Mixed}  properties
   * @param  {String} context
   * @return {Void}
   */
  Klass.accessible = function (properties, context) {
    Klass.readable.apply(null, Array.prototype.slice.call(arguments));
    Klass.writable.apply(null, Array.prototype.slice.call(arguments));
  };
};
