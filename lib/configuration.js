var flatten = require('flat');
var deepFetch = require('./model/utils')({}).deepFetch;
var getPathReferenceArray = require('./model/utils')({}).getPathReferenceArray;

module.exports = function initializeConfiguration (subject) {
  subject.__CONFIG__ = {};
  /**
   * Sets configuration options on the model decorator
   * @param  {String | Object}  key    A mixed value of either a string key to set or a configuration object
   * @param  {Mixed}            val    The value of the passed-in key, or unused if configuring via object
   * @return {Void}
   */
  subject.configure = function (key, val) {
    // we can recursively configure from an object
    if (typeof key === 'object' && Object.keys(key).length) {
      val = flatten(key);
      Object.keys(val).forEach(function (key) {
        subject.configure(key, val[key]);
      });
      return key;
    }

    // or directly from a key/value pair
    var refs = getPathReferenceArray(subject.__CONFIG__, key, {create: true});
    refs[0][refs[1]] = val;
  };

  subject.config = function getConfig (key) {
    return deepFetch(subject.__CONFIG__ || {}, key);
  };
};
