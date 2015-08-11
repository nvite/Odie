function DefaultLogger () {}
var LEVELS = ['debug', 'info', 'warn', 'error', 'log', 'silent'];

LEVELS.forEach(function (meth) {
  meth !== 'silent' && (DefaultLogger.prototype[meth] = function () {
    LEVELS.indexOf(process.env.LOG_LEVEL) <= LEVELS.indexOf(meth) &&
      console &&
      console[meth].apply(null, arguments);
  });
});

module.exports = function initializeLogger () {
  return global.__odielogger__ || new DefaultLogger();
};
