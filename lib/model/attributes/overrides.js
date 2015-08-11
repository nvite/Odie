module.exports = function initializeOverrides (Klass) {
  /**
   * Allows a model definition to override a native method
   * @param  {String}   methodName The name of the method being overridden
   * @param  {Function} functor    A functor that receives a _super argument and returns
   *                               the new method, calling _super where needed
   * @return {Void}
   */
  Klass.overrides = function (methodName, functor) {
    var _super = Klass.prototype[methodName];
    if (typeof _super === 'undefined') {
      throw new Klass.Error('method', methodName + 'is not defined in the original context');
    }
    Klass.prototype[methodName] = functor(_super);
  };
};
