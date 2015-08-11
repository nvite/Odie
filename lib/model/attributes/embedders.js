module.exports = function initializeEmbedders(Klass) {
  Klass.EMBEDDED_DOCUMENTS || (Klass.EMBEDDED_DOCUMENTS = []);
  Klass.EMBEDDED_COLLECTIONS || (Klass.EMBEDDED_COLLECTIONS = []);

  /**
   * Sets a field or array of fields as embedded by the model
   * @todo This method only sets values on `EMBEDDED_DOCUMENTS` or `EMBEDDED_COLLECTIONS`.
   *       It does not add any logic to the model to memoize these things. That functionality
   *       is in testing and may graduate here some day.
   * @param  {String}        type         The type of embed to add, 'collection' or 'document'
   * @param  {Object|Array}  documentDefs An object or Array of objects with signature:
   *                                      `{type, path, getter, memoize_as, options}`
   *                                      - type: the type of document (model name) this relation is
   *                                      - path: where in this model the relation is found.
   *                                              In the case of a document, this points to the _id or an object containing the _id.
   *                                              In the case of a collection, this points to the array of objects or _ids.
   *                                      - getter (optional): The name of the getter function, if not 'get{Path}'
   *                                      - memoize_as (optional): The name of the memoized property if not '{PATH}'
   *                                      - options (optional): A junk-drawer of options to pass to the memoizer functor
   * @return {Void}
   */
  Klass.embeds = function (type, documentDefs) {
    type = type.toUpperCase();
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    if (Array.isArray(args[0])) {
      args = args[0];
    }
    Klass['EMBEDDED_' + type] = (Klass['EMBEDDED_' + type] || []).concat(args);
  };
};
