module.exports = function initializeValidators (Klass) {
  /**
   * Executes the Klass's validators and returns an array of validation errors
   * @param  {Object} options Currently unused
   * @return {Array}          Any validation errors
   */
  Klass.prototype.validate = function (options) {
    // no-op for now
    return [];
  };

  /**
   * Returns a boolean value of whether the model has validation errors
   * @param  {Object}  options Currently unused
   * @return {Boolean}         Whether the model has validation errors
   */
  Klass.prototype.isValid = function (options) {
    return ! this.validate(options).length;
  };
};
