"use strict";

/* global assert:false, assertAsync:false */
require('../test-helper');

var async = require('async');
var Q = require('q');

var model = require('../../lib/model');
var QuerySet = require('../../lib/queryset');

var argmap = {
    hint: 'foo',
    sort: {'foo': -1},
    preload: ['getBar']
};
argmap = ['batchSize', 'limit', 'skip'].reduce(function (accum, key) {
  accum[key] = 5;
  return accum;
}, argmap);
argmap = ['forEach', 'toArray', 'toJSON', 'next', 'then', 'catch'].reduce(function (accum, key) {
  accum[key] = function(){};
  return accum;
}, argmap);

describe("queryset", function () {
  beforeEach(function (done) {
    function ModelTest (properties, options) {
      // Let's refer to our model instance internally as instance to avoid
      // confusing it with the TestCase's `this`.
      var instance = this;
      instance.initializeWith(properties || {});
    }
    model(ModelTest, 'model_tests');
    ModelTest.observable(['foo', 'has_bar']);
    ModelTest.writable('foo');
    ModelTest.memoized('getBar', 'BAR', function innerGetBar(options, done) {
      var dfd = Q.defer();
      var val = Math.random();
      done(null, val);
      dfd.resolve(val);
      return dfd.promise;
    });
    ModelTest.overrides('format', function (_super) {
      return function format (options) {
        options || (options = {});
        var data = JSON.parse(JSON.stringify(this.get()));
        data.has_bar = !!this.__BAR__;
        options.data = data;
        return _super.call(this, options);
      };
    });
    ModelTest.prototype.toString = function () {
      return "foo=" + this.get('foo');
    };
    this.model = ModelTest;
    this.seeds = 40;
    this.model.DB.promise.then(function (db) {
      async.times(this.seeds, function (i, next) {
        ModelTest.create({foo: i}, {safe: true}, next);
      }, function (err, instances) {
        this.subject = this.model.all();
        done(err);
      }.bind(this));
    }.bind(this)).catch(done);
  });

  afterEach(function (done) {
    this.model.DB().collection('model_tests').drop(function (err) {
      done(err);
    });
  });

  describe("monadic interface", function () {
    Object.keys(argmap).forEach(function (meth) {
      it("returns a queryset instance from " + meth, function (done) {
        assert(this.subject[meth](argmap[meth]) instanceof QuerySet);
        done();
      });
    });
  });

  describe("inspect", function () {
    it("returns a format string", function (done) {
      this.subject.inspect().should.eql("<QuerySet: ModelTest>");
      done();
    });
  });

  describe("count", function () {
    it("calls the callback with the number of records", function (done) {
      this.subject.count(function (err, num) {
        assertAsync(done, function () {
          num.should.eql(this.seeds);
          done();
        }.bind(this));
      }.bind(this));
    });

    describe("when limited", function () {
      it("calls the callback with the number of records", function (done) {
        this.subject.limit(2).count(function (err, num) {
          assertAsync(done, function () {
            num.should.eql(this.seeds);
            done();
          }.bind(this));
        }.bind(this));
      });
    });
  });

  describe("limit", function () {
    it("limits the scope of the query", function (done) {
      var qs = this.subject.limit(2);
      qs.explain(function (err, plan) {
        qs.toArray(function (err, instances) {
          assertAsync(done, function () {
            plan.nscannedObjects.should.eql(2);
            instances.length.should.eql(2);
            done();
          });
        });
      });
    });
  });

  describe("skip", function () {
    it("moves the cursor forward by n records", function (done) {
      this.subject.skip(10).toArray(function (err, instances) {
        assertAsync(done, function () {
          instances.length.should.eql(this.seeds - 10);
          instances[0].get('foo').should.eql(10);
          done();
        }.bind(this));
      }.bind(this));
    });
  });

  describe("batchSize", function () {
    it("decreases the number of objects resident in memory while accessing all records", function (done) {
      var counter = 0;
      var explain = Q.defer();
      var count = Q.defer();
      this.subject.batchSize(2).explain(function (err, plan) {
        assertAsync(done, function () {
          plan.nscannedObjects.should.eql(2);
          explain.resolve();
        });
      });
      var iterate = function (qs, prom) {
        qs.next(function (err, instance) {
          if (null === instance || err) {
            if (counter < this.seeds) {
              return prom.reject(new Error('Ran out of records too early!'));
            }
            else {
              return prom.resolve();
            }
          }
          else {
            counter++;
            iterate(qs, prom);
          }
        }.bind(this));
      }.bind(this);
      iterate(this.subject, count);
      Q.all([explain.promise, count.promise]).then(function () {
        done();
      }).catch(done);
    });
  });

  describe("forEach", function () {
    it("calls the callback with each instance", function (done) {
      var deferreds = [];
      for (var i = 0; i < this.seeds; i++) {
        deferreds.push(Q.defer());
      }
      this.subject.forEach(function (err, instance) {
        deferreds[instance.get('foo')].resolve();
      });
      Q.all(deferreds.map(function (dfd) { return dfd.promise; })).timeout(1000).then(function () {
        done();
      }).catch(done);
    });
  });

  describe("toArray", function () {
    it("calls the callback with an array of instances", function (done) {
      this.subject.toArray(function (err, arr) {
        assertAsync(done, function () {
          arr.length.should.eql(40);
          arr[0].get('foo').should.eql(0);
          arr[39].get('foo').should.eql(39);
          done();
        });
      });
    });
  });

  describe("toJSON", function () {
    it("serializes the queryset according to the format rules", function (done) {
      this.subject.toJSON(function (err, formatted) {
        assertAsync(done, function () {
          formatted.length.should.eql(40);
          formatted[0].has_bar.should.eql(false);
          done();
        });
      });
    });
  });

  describe("next", function () {
    it("calls the callback with the next record in the cursor", function (done) {
      this.subject.next(function () {}).next(function (err, instance) {
        if (err) {
          return done(err);
        }
        assertAsync(done, function () {
          instance.get('foo').should.eql(1);
          done();
        });
      });
    });
  });

  describe("rewind", function () {
    beforeEach(function (done) {
      this.subject = this.model.all().next(function () {}).next(function (err, instance) {
        assertAsync(done, function () {
          instance.get('foo').should.eql(1);
          done();
        });
      });
    });
    it("rewinds the cursor", function (done) {
      this.subject.rewind().next(function (err, instance) {
        assertAsync(done, function () {
          instance.get('foo').should.eql(0);
          done();
        });
      });
    });
  });

  describe("then", function () {
    it("calls the callback with an array of instances", function (done) {
      this.subject.then(function (instances) {
        assertAsync(done, function () {
          instances.length.should.eql(40);
          instances[0].get('foo').should.eql(0);
          instances[20].get('foo').should.eql(20);
          done();
        });
      });
    });
  });

  describe("catch", function () {
    beforeEach(function (done) {
      this.subject.__hydrationHandler = this.subject._hydrationHandler;
      this.subject._hydrationHandler = function () {
        throw new Error('oops');
      };
      done();
    });
    afterEach(function (done) {
      this.subject._hydrationHandler = this.subject.__hydrationHandler;
      delete this.subject.__hydrationHandler;
      done();
    });

    it("calls the callback with an error", function (done) {
      this.subject = this.model.find({foo: {$elemMatch: 'badsyntax'}});
      this.subject.then(function (records) {
        done(new Error('Then callback should not have been called!'));
      }).catch(function (err) {
        assertAsync(done, function () {
          err.message.should.match(/\$elemMatch needs an Object|expected an object \(\$elemMatch\)/);
          assert.equal(this.subject._finalErrorHandler, undefined);
          done();
        }.bind(this));
      }.bind(this));
    });
  });

  describe("preload", function () {
    it("accepts a string property name", function (done) {
      this.subject.preload('getBar');
      this.subject.next(function (err, instance) {
        assertAsync(done, function () {
          assert(instance.__BAR__);
          done();
        });
      });
    });

    it("accepts an array of property names", function (done) {
      this.subject.preload(['getBar']);
      this.subject.next(function (err, instance) {
        assertAsync(done, function () {
          assert(instance.__BAR__);
          done();
        });
      });
    });

  });
});
