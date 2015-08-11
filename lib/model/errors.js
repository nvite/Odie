module.exports = function initializeErrors (Klass) {
  /**
   * An error thrown by Model instances/classes when unexpected conditions are encountered
   * @private
   */
  function ModelError (name, message) {
    var err = new Error();
    err.message = message;
    err.name = (Klass.name || 'Model') + '.' + name + 'Error';
    return err;
  }

  // Export our error so we can invoke it from Model definitions
  Klass.Error = ModelError;
};
