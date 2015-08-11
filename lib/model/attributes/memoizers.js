var Q = require('q');

module.exports = function initializeMemoizers (Klass) {
  Klass.memoized = function (methodName, propName, functor) {
    var innerPropName = '__' + propName.toUpperCase() + '__';
    Klass.prototype[methodName] = function memoizedFunction (options) {
      // memoized functions are expensive by nature so we can assume they'll use promises.
      var dfd = Q.defer();
      // define a callback to set the value on the instance
      var done = function done (err, value) {
        if (!err) {
          this[innerPropName] = value;
        }
      }.bind(this);
      // ensure we have an options object
      options || (options = {});
      // if the prop is set on the instance we can return it
      if (this[innerPropName] && options.force !== true) {
        dfd.resolve(this[innerPropName]);
      // otherwise we need to call the functor to get a value
      }
      else {
        delete options.force;
        // ensure our callback and options are passed in first, followed by whatever args the method needs
        var args = Array.prototype.slice.call(arguments);
        args.unshift(done);
        args.unshift(options);
        return functor.apply(this, args);
      }
      return dfd.promise;
    };
  };
};
