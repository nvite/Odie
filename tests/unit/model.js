"use strict";

/* global assert:false, assertAsync:false */
require('../test-helper');

var model = require('../../lib/model');
var PATTERNS = require('../../lib/model/patterns');

describe("model", function () {
  beforeEach(function (done) {
    function ModelTest (properties, options) {
      // Let's refer to our model instance internally as instance to avoid
      // confusing it with the TestCase's `this`.
      var instance = this;
      instance.initializeWith(properties || {});
    }
    model(ModelTest, 'model_tests');

    // Set up some accessible properties for our default context
    ModelTest.accessible(['foo', 'bar']);
    // And some other properties for a named context
    ModelTest.accessible('privileged', ModelTest.OBSERVABLE_PROPERTIES.default.concat(['baz']));

    // Add a custom save method to our mock model to test later
    ModelTest.overrides('save', function (_super) {
      return function save (options, cb) {
        this.customMethodCalled = true;
        return _super.call(this, options, cb);
      };
    });
    this.model = ModelTest;
    this.subject = new this.model();
    this.model.DB.promise.then(function (db) {
      done();
    }).catch(done);
  });

  // tear down the model_tests table after each run
  afterEach(function (done) {
    this.model.DB().collection('model_tests')
      .drop(function (err) {
        done();
    });
  });

  describe("instance methods", function () {
    describe("getClassName", function () {
      it("reports its class name", function (done) {
        this.subject.getClassName().should.eql('ModelTest');
        done();
      });
    });

    describe("getCollectionName", function () {
      it("reports its database collection name", function (done) {
        this.subject.getCollectionName().should.eql('model_tests');
        done();
      });
    });

    describe("initializeWith", function () {
      it("can be initialized with data", function (done) {
        this.subject.initializeWith({foo: 'bar'});
        this.subject.get('foo').should.eql('bar');
        Object.keys(this.subject.get())[0].should.eql('foo');
        Object.keys(this.subject.get()).length.should.eql(1);
        done();
      });
    });

    describe("updateWith", function () {
      beforeEach(function (done) {
        this.model.DB().collection('model_tests').count(function(err, num) {
          this.subject = new this.model();
          this.subject.set('foo', {bar: 'baz'});
          this.subject.set('bar', 'blah');
          this.subject.save(function (err, id) {
            this.record = id;
            done();
          }.bind(this));
        }.bind(this));
      });

      it("supports callback functions", function (done) {
        this.subject.updateWith({'foo.bar': 'meh'}, done);
      });

      it("supports promises", function (done) {
        this.subject.updateWith({'foo.bar': 'meh'}).then(function (id) {
          done();
        });
      });

      it("merges in the new context rather than setting", function (done) {
        this.subject.updateWith({'foo.bar': 'meh'}).then(function (id) {
          assertAsync(done, function(){
            this.subject.get('foo.bar').should.eql('meh');
            this.subject.get('bar').should.eql('blah');
            done();
          }.bind(this));
        }.bind(this));
      });

      it("supports nested objects as a merge context", function (done) {
        this.subject.updateWith({foo: {bar: 'meh'}}).then(function (id) {
          assertAsync(done, function(){
            this.subject.get('foo.bar').should.eql('meh');
            done();
          }.bind(this));
        }.bind(this));
      });

      it("supports dot-delimited paths as a merge context", function (done) {
        this.subject.updateWith({'foo.bar': 'meh'}).then(function (id) {
          assertAsync(done, function(){
            this.subject.get('foo.bar').should.eql('meh');
            done();
          }.bind(this));
        }.bind(this));
      });

      it("calls any special logic defined on the model's save method", function (done) {
        this.subject = new this.model();
        this.subject.updateWith({foo: 'meh'}).then(function (id) {
          assertAsync(done, function () {
            assert(this.subject.customMethodCalled);
            done();
          }.bind(this));
        }.bind(this));
      });

      describe("new instances", function () {
        beforeEach(function (done) {
          this.subject = new this.model();
          this.subject.set('foo', {bar: 'baz'});
          this.subject.set('bat', 'blah');
          assertAsync(done, function (){
            assert(!this.subject.get('_id'));
            done();
          }.bind(this));
        });

        it("updates the model's content and persists the result", function (done) {
          this.subject.updateWith({foo: 'meh'}).then(function (id) {
            this.model.DB().collection(this.subject.getCollectionName()).findOne({_id: id}, function (err, record) {
              assertAsync(done, function () {
                assert.equal(record.foo, 'meh');
                done();
              });
            });
          }.bind(this))
          .catch(function (err) {
            done(err);
          });
        });

        it("discards any unsaved current state", function (done) {
          this.subject.updateWith({foo: 'meh'}).then(function (id) {
            this.model.DB().collection(this.subject.getCollectionName()).findOne({_id: id}, function (err, record) {
              assertAsync(done, function () {
                assert(!record.bar);
                done();
              });
            });
          }.bind(this))
          .catch(function (err) {
            done(err);
          });
        });
      });

      describe("persisted instances", function () {
        it("updates the model's content and persists the result", function (done) {
          this.subject.updateWith({foo: 'meh'}).then(function (id) {
            this.model.DB().collection(this.subject.getCollectionName()).findOne({_id: id}, function (err, record) {
              assertAsync(done, function () {
                assert(record.foo === 'meh');
                assert(record.bar === 'blah');
                done();
              });
            });
          }.bind(this))
          .catch(function (err) {
            this.model.get(this.subject.get('_id')).then(function (record) {
              done(err);
            });
          }.bind(this));
        });
      });

      describe("destroyed instances", function () {
        it("rejects with an error", function (done) {
          this.subject.destroy().then(function () {
            this.subject.updateWith({foo: 'meh'}).then(function () {
              done(new Error('Model saved when it should have errored!'));
            }).catch(function (err) {
              assertAsync(done, function () {
                err.name.should.eql('ModelTest.persistenceError');
                err.message.should.eql('0 records updated!');
                done();
              });
            });
          }.bind(this));
        });
      });
    });

    describe("directUpdateWith", function () {
      it("returns an error for new instances", function (done) {
        this.subject.directUpdateWith({foo: 'meh'}, function (err, id) {
          assertAsync(done, function () {
            err.name.should.eql('ModelTest.persistenceError');
            done();
          });
        }.bind(this));
      });

      it("skips any special logic defined on the model's save method", function (done) {
        this.subject.set('foo', {bar: 'baz'});
        this.subject.save().then(function (id) {
          this.subject.customMethodCalled = undefined;
          this.subject.directUpdateWith({foo: 'meh'}, function (err, id) {
            assertAsync(done, function () {
              assert(!this.subject.customMethodCalled, 'customMethodCalled should be undefined');
              done();
            }.bind(this));
          }.bind(this));
        }.bind(this));
      });

      it("updates the model's content and persists the result", function (done) {
        this.subject.set('foo', {bar: 'baz'});
        this.subject.save().then(function (id) {
          this.subject.directUpdateWith({foo: 'meh'}, function (err, id) {
            assertAsync(done, function () {
              this.subject.get('foo').should.eql('meh');
              done();
            }.bind(this));
          }.bind(this));
        }.bind(this));
      });

      describe("destroyed instances", function () {
        beforeEach(function (done) {
          this.subject.set('foo', {bar: 'baz'});
          this.subject.save().then(function (id) {
            done();
          });
        });

        it("rejects with an error", function (done) {
          this.subject.destroy().then(function () {
            this.subject.updateWith({foo: 'meh'}).then(function () {
              done(new Error('Model saved when it should have errored!'));
            }).catch(function (err) {
              assertAsync(done, function () {
                err.name.should.eql('ModelTest.persistenceError');
                err.message.should.eql('0 records updated!');
                done();
              });
            });
          }.bind(this));
        });
      });
    });

    describe("get", function () {
      it("returns the entire unpersisted state when called without an argument", function (done) {
        this.subject.initializeWith({
          foo: 'bar',
          bar: 'baz',
          baz: 'bat'
        });
        Object.keys(this.subject.get()).sort().should.eql(['bar', 'baz', 'foo']);
        done();
      });

      it("nests arbitrarily into set keys", function (done) {
        this.subject.initializeWith({
          foo: { bar: { baz: 'bat' } }
        });
        this.subject.get('foo.bar.baz').should.eql('bat');
        done();
      });

      it("nests arbitrarily into unset keys", function (done) {
        assert.equal(this.subject.get('foo.bar.baz'), undefined);
        done();
      });

      it("returns a default value when provided", function (done) {
        this.subject.get('foo.bar.baz', 'blah').should.eql('blah');
        done();
      });
    });

    describe("set", function () {
      it("throws an error when called without a path", function (done) {
        (function () {
          this.subject.set();
        }).should.throw();
        done();
      });

      it("throws an error when called without a string path", function (done) {
        (function () {
          this.subject.set({foo: 'bar'});
        }).should.throw();
        done();
      });

      it("sets values at arbitrary depths when a key is not defined", function (done) {
        this.subject.set('foo.bar', 'baz');
        this.subject.get('foo.bar').should.eql('baz');
        Object.keys(this.subject.get()).should.eql(['foo']);
        done();
      });

      it("does not clobber sibling values", function (done) {
        this.subject.set('foo.bar', 'baz');
        this.subject.set('foo.bat', 'bar');
        this.subject.get('foo.bar').should.eql('baz');
        this.subject.get('foo.bat').should.eql('bar');
        done();
      });
    });

    describe("unset", function () {
      beforeEach(function (done) {
        this.subject.initializeWith({
          foo: {
            bar: 'baz'
          }
        });
        done();
      });

      it("throws an error when called without a path", function (done) {
        (function () {
          this.subject.unset();
        }).should.throw();
        done();
      });

      it("throws an error when called without a string path", function (done) {
        (function () {
          this.subject.unset({foo: 'bar'});
        }).should.throw();
        done();
      });

      it("deletes a key from the unpersisted state", function (done) {
        this.subject.unset('foo');
        Object.keys(this.subject.get()).should.be.empty;
        done();
      });

      it("does not alter the persisted state", function (done) {
        this.subject.save(function (id) {
          this.subject.unset('foo');
          (this.subject['_*'].foo.bar).should.eql('baz');
          done();
        }.bind(this));
      });
    });

    describe("push", function () {
      it("throws an error when the value at the passed-in path is not an array", function (done) {
        this.subject.set('foo.bar', 'baz');
        (function () {
          this.subject.push('foo.bar', 'bat');
        }).should.throw();
        done();
      });

      it("pushes a new value onto an uninitialized path", function (done) {
        this.subject.push('foo', 'bat');
        this.subject.get('foo')[0].should.eql('bat');
        this.subject.get('foo').length.should.eql(1);
        done();
      });

      it("pushes a value onto the unpersisted state", function (done) {
        this.subject.set('foo', ['bar']);
        this.subject.push('foo', 'bat');
        this.subject.get('foo')[1].should.eql('bat');
        done();
      });
    });

    describe("unshift", function () {
      it("throws an error when the value at the passed-in path is not an array", function (done) {
        this.subject.set('foo.bar', 'baz');
        (function () {
          this.subject.unshift('foo.bar', 'bat');
        }).should.throw();
        done();
      });

      it("unshifts a new value onto an uninitialized path", function (done) {
        this.subject.unshift('foo', 'bat');
        this.subject.get('foo')[0].should.eql('bat');
        this.subject.get('foo').length.should.eql(1);
        done();
      });

      it("unshifts a value onto the unpersisted state", function (done) {
        this.subject.set('foo', ['bar']);
        this.subject.unshift('foo', 'bat');
        this.subject.get('foo')[0].should.eql('bat');
        done();
      });
    });

    describe("splice", function () {
      it("throws an error when the value at the passed-in path is not an array", function (done) {
        this.subject.set('foo.bar', 'baz');
        (function () {
          this.subject.splice('foo.bar', 0, 1);
        }).should.throw();
        done();
      });

      it("splices the value of the unpersisted state at the passedin-path", function (done) {
        this.subject.set('foo', ['a', 'b', 'c', 'd', 'e']);
        var vals = this.subject.splice('foo', 2, 2);
        vals.should.eql(['c', 'd']);
        this.subject.get('foo').should.eql(['a', 'b', 'e']);
        done();
      });
    });

    describe("dirtyFields", function () {
      describe("new instances", function () {
        it("returns all field names that are set", function (done) {
          this.subject.set('foo', {bar: 'blah', baz: 'blee'});
          this.subject.dirtyFields().should.eql(['foo.bar', 'foo.baz']);
          done();
        });
      });

      describe("persisted instances", function () {
        beforeEach(function (done) {
          this.subject.set('foo', ['a', 'b']);
          this.subject.set('bar', 'baz');
          this.subject.save(function () {
            done();
          });
        });

        it("returns only the changed field names", function (done) {
          this.subject.set('bar', 'bat');
          this.subject.dirtyFields().should.eql(['bar']);
          done();
        });

        it("doesn't recurse into arrays", function (done) {
          this.subject.push('foo', 'c');
          this.subject.dirtyFields().should.eql(['foo']);
          done();
        });
      });
    });

    describe("isDirty", function () {
      describe("new instances", function () {
        it("Shuffles options out of the path position when only options are passed", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.isDirty({options: 'are unused right now'}).should.eql(true);
          done();
        });

        it("returns whether the model has unpersisted changes", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.isDirty().should.eql(true);
          done();
        });

        it("returns whether a specific path on the model has unpersisted changes", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.isDirty('foo').should.eql(true);
          this.subject.isDirty('bar').should.eql(false);
          done();
        });
      });

      describe("persisted instances", function () {
        beforeEach(function (done) {
          this.subject.set('foo', 'bar');
          this.subject.save()
              .then(function (id) {
                done();
              })
              .catch(function (err) {
                done(err);
              });
        });

        it("returns whether the model has unpersisted changes", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.isDirty().should.eql(true);
          done();
        });

        it("returns whether a specific path on the model has unpersisted changes", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.isDirty('foo').should.eql(true);
          this.subject.isDirty('bar').should.eql(false);
          done();
        });
      });
    });

    describe("isNew", function () {
      describe("new instances", function () {
        it("returns true", function (done) {
          this.subject.isNew().should.eql(true);
          done();
        });
      });

      describe("persisted instances", function () {
        beforeEach(function (done) {
          this.subject.save(function (err, id) {
            if (err || (!id)) {
              return done(new Error('Expected to get an id from Model#save!'));
            }
            done();
          });
        });

        it("returns false", function (done) {
          this.subject.isNew().should.eql(false);
          done();
        });
      });
    });

    describe("isValid", function () {
      it("returns true when the model is valid");
      it("returns false when the model is not valid");
    });

    describe("canWrite", function () {
      it("returns true when the property is writable", function (done) {
        this.subject.canWrite('foo').should.eql(true);
        done();
      });

      it("returns false when the property is not writable", function (done) {
        this.subject.canWrite('baz').should.eql(false);
        done();
      });

      it("returns true when the property is not writable, but the observer has the appropriate privilege", function (done) {
        this.subject.canWrite('baz', {as: 'privileged'}).should.eql(true);
        done();
      });

      it("returns false when the property is not writable, and the observer has an unknown observation context", function (done) {
        this.subject.canWrite('baz', {as: 'aShadyCharacter'}).should.eql(false);
        done();
      });

      it("returns true when the property is not writable, but the observation context is _all", function (done) {
        this.subject.canWrite('admin', {as: '_all'}).should.eql(true);
        done();
      });
    });

    describe("clean", function () {
      it("prunes unstored properties from the model", function (done) {
        this.subject.set('beep', 'boop');
        this.subject.clean();
        assert.equal(this.subject.get('beep'), undefined);
        done();
      });

      it("resets all of a deeply nested disallowed property", function (done) {
        this.subject.set('beep.boop.bap', 'bop');
        this.subject.clean();
        assert.equal(this.subject.get('beep'), undefined);
        done();
      });

      describe("privileged properties", function () {
        it("does not prune properties with privileged access from the model", function (done) {
          this.subject.set('baz', 'bloop');
          this.subject.clean({as: 'privileged'});
          this.subject.get('baz').should.eql('bloop');
          done();
        });

        it("permits the writing of anything with the _all context", function (done) {
          this.subject.set('invalid', 'property');
          this.subject.clean({as: '_all'});
          this.subject.get('invalid').should.eql('property');
          done();
        });
      });

      describe("persisted instances", function () {
        it("does not prune unchanged unstored properties from the model", function (done) {
          this.subject.set('beep', 'boop');
          this.subject.save({clean: false}, function (err, id) {
            assertAsync(done, function () {
              this.subject.clean();
              this.subject.get('beep').should.eql('boop');
              done();
            }.bind(this));
          }.bind(this));
        });

        it("resets changed (but pre-existing) unstored properties on the model", function (done) {
          this.subject.set('beep.boop.bap', 'boop');
          this.subject.save({clean: false}, function (err, id) {
            assertAsync(done, function () {
              this.subject.set('beep', 'floop');
              this.subject.clean();
              this.subject.get('beep.boop.bap').should.eql('boop');
              done();
            }.bind(this));
          }.bind(this));
        });
      });
    });

    describe("validate", function () {
      it("returns an empty array when the model is valid");
      it("returns an error when the model is invalid");
      it("includes the failing fields in the error");
      it("supports callbacks");
      it("supports promises");
    });

    describe("reset", function () {
      beforeEach(function (done) {
        this.subject.initializeWith({
          foo: 'bar'
        });
        done();
      });

      describe("new instances", function () {
        it("resets the specified path to undefined", function (done) {
          this.subject.reset('foo');
          assert.equal(this.subject.get('foo'), undefined);
          done();
        });

        it("resets the whole model to an empty object when no path is specified", function(done ){
          this.subject.reset();
          (typeof this.subject.get()).should.eql('object');
          Object.keys(this.subject.get()).should.eql([]);
          done();
        });

        it("Shuffles options out of the path position when only options are passed", function (done) {
          this.subject.set('foo', 'yikes');
          this.subject.reset({options: 'are unused right now'});
          Object.keys(this.subject.get()).should.eql([]);
          done();
        });
      });

      describe("persisted instances", function () {
        beforeEach(function (done) {
          this.subject.save().then(function () {
            done();
          });
        });

        it("resets the specified path to the previous value", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.reset('foo');
          this.subject.get('foo').should.eql('bar');
          done();
        });

        it("does not reset the whole model when a path is specified", function (done) {
          this.subject.set('bar', 'blah');
          this.subject.reset('foo');
          this.subject.get('bar').should.eql('blah');
          done();
        });

        it("resets the whole model when no path is specified", function (done) {
          this.subject.set('foo', 'blah');
          this.subject.set('bar', 'quux');
          this.subject.reset();
          this.subject.get('foo').should.eql('bar');
          Object.keys(this.subject.get()).should.eql(['foo', 'updated_at', 'created_at', '_id']);
          done();
        });
      });
    });

    describe("reload", function () {
      beforeEach(function (done) {
        this.subject.set('foo', 'bar');
        done();
      });

      describe("new instances", function () {
        it("does nothing", function (done) {
          this.subject.reload()
              .then(function () {
                assertAsync(done, function () {
                  this.subject.get('foo').should.eql('bar');
                  assert.equal(this.subject.get('_id'), undefined);
                  assert.equal(this.subject['_*'], undefined);
                  done();
                }.bind(this));
              }.bind(this))
              .catch (function (err) {
                done(err);
              });
        });
      });

      describe("persisted instances", function () {
        it("updates the persisted and unpersisted states with what's in the database", function (done) {
          this.model.DB().collection('model_tests').insert({
            foo: 'meh',
            bar: 'blee'
          }, function (err, records) {
            var record = records[0];
            this.subject.set('_id', record._id);
            this.subject['_*'] = { _id: record._id };
            this.subject.reload(function (err) {
              if (err) {
                return done(err);
              }
              assertAsync(done, function () {
                this.subject.get('foo').should.eql('meh');
                this.subject.get('bar').should.eql('blee');
                (this.subject['_*'].foo).should.eql('meh');
                (this.subject['_*'].bar).should.eql('blee');
                done();
              }.bind(this));
            }.bind(this));
          }.bind(this));
        });
      });
    });

    describe("format", function () {
      beforeEach(function (done) {
        this.subject.set('foo', 'bar');
        this.subject.set('bar', 'baz');
        this.subject.set('baz', 'blah');
        this.subject.save({clean: false}).then(function () {
          done();
        });
      });

      it("filters out unobservable properties when the observer is not privileged", function (done) {
        Object.keys(this.subject.format()).sort().should.eql(['_id', 'bar', 'foo']);
        done();
      });

      it("retains unobservable properties when the observer is privileged", function (done) {
        Object.keys(this.subject.format({as: 'privileged'})).sort().should.eql(['_id', 'bar', 'baz', 'foo']);
        done();
      });

      it("returns the whole model when no observables are defined", function (done) {
        delete(this.model.OBSERVABLE_PROPERTIES);
        Object.keys(this.subject.format()).sort().should.eql(['_id', 'bar', 'baz', 'created_at', 'foo', 'updated_at']);
        done();
      });

      it("formats embedded models when encountered");
    });

    describe("toJSON", function () {
      it("protects all privileged fields when stringified");
    });

    describe("save", function () {
      beforeEach(function (done) {
        this.subject = new this.model();
        this.subject.set('foo', 'bar');
        this.subject.set('bar', ['a', 'b']);
        done();
      });

      describe("callback api", function () {
        // This is unreachable; timestamp always changes
        // it("returns without saving when no changes are made", function (done) {
        //   this.subject.save(function (err, id) {
        //     var updated = this.subject.get('updated_at');
        //     setTimeout(function () {
        //       this.subject.save(function (err, id) {
        //         assertAsync(done, function () {
        //           assert(id);
        //           assert.equal(err, undefined);
        //           this.subject.get('updated_at').should.eql(updated);
        //           done();
        //         }.bind(this));
        //       }.bind(this));
        //     }.bind(this), 200);
        //   }.bind(this));
        // });

        it("calls the callback with the id on success", function (done) {
          this.subject.save(function (err, id) {
            assertAsync(done, function () {
              assert(id);
              assert.equal(err, undefined);
              assert(PATTERNS.OBJECTID.test(id.toString()));
              done();
            }.bind(this));
          }.bind(this));
        });

        it("calls the callback with the error on error", function (done) {
          this.subject.validate = function () {
            return ['foo'];
          };
          this.subject.save(function (err) {
            assertAsync(done, function () {
              assert(err);
              assert.equal(err.fields[0], 'foo');
              done();
            }.bind(this));
          });
        });
      });

      describe("promise api", function () {
        // it("resolves without saving when no changes are made", function (done) {
        //   this.subject.save().then(function (id) {
        //     var updated = this.subject.get('updated_at');
        //     setTimeout(function () {
        //       this.subject.save().then(function (id) {
        //         assertAsync(done, function () {
        //           assert(id);
        //           this.subject.get('updated_at').should.eql(updated);
        //           done();
        //         }.bind(this));
        //       }.bind(this));
        //     }.bind(this), 200);
        //   }.bind(this));
        // });

        it("works when a callback isn't provided", function (done) {
          this.subject.save()
              .then(function (id) {
                assertAsync(done, function () {
                  assert(id);
                  assert(PATTERNS.OBJECTID.test(id.toString()));
                  done();
                }.bind(this));
              }.bind(this))
              .catch(function (err) {
                done(err);
              });
        });

        it("rejects with the error on error", function (done) {
          this.subject.validate = function () {
            return ['foo'];
          };
            this.subject.save()
                .then(function () {
                  done(new Error('Expected the promise to be rejected'));
                })
                .catch(function (err) {
                  assertAsync(done, function () {
                    assert(err);
                    assert.equal(err.fields[0], 'foo');
                    done();
                  }.bind(this));
                });
        });
      });

      describe("new instances", function () {
        it("inserts the unpersisted state into the database and returns an id", function (done) {
          this.subject.save().then(function (id) {
            this.model.DB().collection('model_tests').findOne({_id: id}, function (err, record) {
              assertAsync(done, function () {
                assert(PATTERNS.OBJECTID.test(id.toString()));
                Object.keys(record).sort().should.eql(['_id', 'bar', 'created_at', 'foo', 'updated_at']);
                done();
              }.bind(this));
            }.bind(this));
          }.bind(this));
        });

        it("sets the persisted state", function (done) {
          this.subject.save().then(function (id) {
            assertAsync(done, function () {
              assert.equal(this.subject['_*'].foo, 'bar');
              done();
            }.bind(this));
          }.bind(this));
        });
      });

      describe("persisted instances", function () {
        beforeEach(function (done) {
          this.subject.save().then(function (id) {
            done();
          }).catch(function (err) {
            done(err);
          });
        });

        it("calls the clean method by default", function (done) {
          this.subject.set('invalid', 'property');
          this.subject.save()
              .then(function (id) {
                this.model.DB().collection('model_tests').findOne({_id: id}, function (err, record) {
                  if (err) { return done(err); }
                  assertAsync(done, function () {
                    assert.equal(record.invalid, undefined);
                    done();
                  });
                });
              }.bind(this));
        });

        it("skips the clean method when requested", function (done) {
          this.subject.set('invalid', 'property');
          this.subject.save({clean: false})
              .then(function (id) {
                this.model.DB().collection('model_tests').findOne({_id: id}, function (err, record) {
                  if (err) { return done(err); }
                  assertAsync(done, function () {
                    record.invalid.should.eql('property');
                    done();
                  });
                });
              }.bind(this));
        });

        it("can remove fields");

        it("updates the database correctly and returns an id", function (done) {
          this.subject.push('bar', 'c');
          this.subject.save()
              .then(function (id) {
                this.model.DB().collection('model_tests').findOne({_id: id}, function (err, record) {
                  assertAsync(done, function () {
                    assert(PATTERNS.OBJECTID.test(id.toString()));
                    record.foo.should.eql('bar');
                    record.bar.should.eql(['a', 'b', 'c']);
                    assert(this.subject['_*'].updated_at);
                    done();
                  }.bind(this));
                }.bind(this));
              }.bind(this))
              .catch(function (err) {
                done(err);
              });
        });

        it("sets the persisted state with the right data", function (done) {
          this.subject.set('bar', 'baz');
          this.subject.save()
              .then(function (id) {
                assertAsync(done, function () {
                  this.subject['_*'].foo.should.eql('bar');
                  this.subject['_*'].bar.should.eql('baz');
                  assert(this.subject['_*'].updated_at);
                  done();
                }.bind(this));
              }.bind(this))
              .catch(function (err) {
                done(err);
              }.bind(this));
        });

        it("can remove items from an array", function (done) {
          this.subject.push('bar', 'c');
          this.subject.push('bar', 'd');
          this.subject.push('bar', 'e');
          this.subject.push('bar', 'f');
          this.subject.push('bar', 'g');
          this.subject.save().then(function (id) {
            this.subject.set('bar', ['a', 'c', 'd', 'f']);
            this.subject.save().then(function (id) {
              this.subject.get('bar').should.eql(['a', 'c', 'd', 'f']);
              done();
            }.bind(this))
            .catch(done);
          }.bind(this))
          .catch(done);
        });
      });

      it("reloads the record from the database before resolving", function (done) {
        this.subject.save()
            .then(function (id) {
              this.model.DB().collection('model_tests').update({_id: id}, {bar: 'baz'}, {safe: true}, function (err, numUpdated) {
                this.subject.set('bar', 'blah');
                this.subject.save().then(function (id) {
                  assertAsync(done, function () {
                    this.subject.get('bar').should.eql('blah');
                    done();
                  }.bind(this));
                }.bind(this))
                .catch(function (err) {
                  done(err);
                });
              }.bind(this));
            }.bind(this))
            .catch(function (err) {
              done(err);
            });
      });
    });

    describe("destroy", function () {
      it("deletes the record", function (done) {
        this.subject.save().then(function (id) {
          this.subject.destroy().then(function () {
            this.model.DB().collection('model_tests').count(function (err, count) {
              if (err) { return done(err); }
              assertAsync(done, function () {
                count.should.eql(0);
                done();
              });
            });
          }.bind(this)).catch(done);
        }.bind(this)).catch(done);
      });

      it("deletes only the intended record", function (done) {
        var casualty = new this.model({foo: 'Hi!'});
        casualty.save()
          .then(function (cid) {
            this.subject.save().then(function (id) {
              this.subject.destroy(function (err) {
                if (err) {
                  return done(err);
                }
                this.model.DB().collection('model_tests').find().toArray(function(err, objs) {
                  if (err) { return done(err); }
                  assertAsync(done, function () {
                    objs.length.should.eql(1);
                    objs[0].foo.should.eql('Hi!');
                    done();
                  });
                });
              }.bind(this));
            }.bind(this));
          }.bind(this));
      });

      it("does nothing if the instance has no id");
    });
  });

  describe("class methods", function () {
    describe("observable", function () {
      it("adds to the class' OBSERVABLE_PROPERTIES", function (done) {
        this.model.observable('dishwasher');
        this.model.OBSERVABLE_PROPERTIES.default.indexOf('dishwasher').should.not.eql(-1);
        done();
      });

      it("adds to the right observer context", function (done) {
        this.model.observable('privileged', 'dishwasher');
        this.model.OBSERVABLE_PROPERTIES.default.indexOf('dishwasher').should.eql(-1);
        this.model.OBSERVABLE_PROPERTIES.privileged.indexOf('dishwasher').should.not.eql(-1);
        done();
      });

      it("dedupes the property list", function (done) {
        this.model.observable('dishwasher');
        this.model.observable('dishwasher');
        this.model.OBSERVABLE_PROPERTIES.default.filter(function (prop) {
          return prop === 'dishwasher';
        }).length.should.eql(1);
        done();
      });
    });

    describe("writable", function () {
      it("adds to the class' WRITABLE_PROPERTIES", function (done) {
        this.model.writable('dishwasher');
        this.model.WRITABLE_PROPERTIES.default.indexOf('dishwasher').should.not.eql(-1);
        done();
      });

      it("adds to the right observer context", function (done) {
        this.model.writable('privileged', 'dishwasher');
        this.model.WRITABLE_PROPERTIES.default.indexOf('dishwasher').should.eql(-1);
        this.model.WRITABLE_PROPERTIES.privileged.indexOf('dishwasher').should.not.eql(-1);
        done();
      });

      it("dedupes the property list", function (done) {
        this.model.writable('dishwasher');
        this.model.writable('dishwasher');
        this.model.WRITABLE_PROPERTIES.default.filter(function (prop) {
          return prop === 'dishwasher';
        }).length.should.eql(1);
        done();
      });
    });

    describe("accessible", function () {
      it("adds to OBSERVABLE and WRITABLE", function (done) {
        this.model.accessible('dishwasher');
        this.model.OBSERVABLE_PROPERTIES.default.indexOf('dishwasher').should.not.eql(-1);
        this.model.WRITABLE_PROPERTIES.default.indexOf('dishwasher').should.not.eql(-1);
        done();
      });

      it("adds to the right observer context", function (done) {
        this.model.accessible('privileged', 'dishwasher');
        this.model.OBSERVABLE_PROPERTIES.default.indexOf('dishwasher').should.eql(-1);
        this.model.WRITABLE_PROPERTIES.default.indexOf('dishwasher').should.eql(-1);
        this.model.OBSERVABLE_PROPERTIES.privileged.indexOf('dishwasher').should.not.eql(-1);
        this.model.WRITABLE_PROPERTIES.privileged.indexOf('dishwasher').should.not.eql(-1);
        done();
      });
    });

    describe("overrides", function () {
      it("throws when the method isn't defined");
      it("augments the passed-in method");
    });

    describe("get", function () {
      beforeEach(function (done) {
        this.subject.set('foo', 'bar');
        this.subject.save().then(function (id) {
          this.record = id;
          done();
        }.bind(this));
      });

      it("throws an error if the first argument can't be coerced into an ObjectId", function (done) {
        (function () {
          this.model.get('foo');
        }.bind(this)).should.throw();
        done();
      });

      it("returns a single model instance when found", function (done) {
        this.model.get(this.record).then(function (instance) {
          assertAsync(done, function () {
            instance.get('foo').should.eql('bar');
            done();
          });
        })
        .catch(function (err) {
          done(err);
        });
      });

      it("returns undefined when not found", function (done) {
        this.model.get('abcdefabcdefabcdefabcdef').then(function (instance) {
          assertAsync(done, function () {
            assert.equal(instance, undefined);
            done();
          });
        })
        .catch(function (err) {
          done(err);
        });
      });
    });

    describe("find", function () {
      beforeEach(function (done) {
        new this.model({
          foo: 'bar',
          bar: 'fizz'
        }).save(function (err, id1) {
          this.records = [id1.toString()];
          new this.model({
            foo: 'bar',
            bar: 'buzz'
          }).save(function (err, id2) {
            this.records.push(id2.toString());
            done();
          }.bind(this));
        }.bind(this));
      });

      it("returns an array of model instances", function (done) {
        this.model.find({foo: 'bar'}).then(function (records) {
          assertAsync(done, function () {
            records.map(function (instance) {
              return instance.get('_id').toString();
            }).should.eql(this.records);
            records[0].get('bar').should.eql('fizz');
            records[1].get('bar').should.eql('buzz');
            done();
          }.bind(this));
        }.bind(this))
        .catch(function (err) {
          done(err);
        });
      });

      it("returns an empty array when not found", function (done) {
        this.model.find({foo: 'buzz'}).then(function (records) {
          assertAsync(done, function () {
            records.length.should.eql(0);
            done();
          });
        })
        .catch(function (err) {
          done(err);
        });
      });
    });

    describe("create", function () {
      describe("when a matching instance does not exist", function () {
        it("creates a new instance", function (done) {
          this.model.create({foo: 'bar'}).then(function (instance) {
            this.model.DB().collection('model_tests').count({foo: 'bar'}, function (err, count) {
              if (err) { return done(err); }
              assertAsync(done, function () {
                instance.isNew().should.eql(false);
                instance.get('foo').should.eql('bar');
                instance['_*'].foo.should.eql('bar');
                count.should.eql(1);
                assert(instance.get('_id'));
                done();
              });
            });
          }.bind(this));
        });
      });

      describe("when a matching instance does exist", function () {
        beforeEach(function (done) {
          this.model.DB().collection('model_tests').insert({foo: 'bar'}, function (err, record) {
            if (err) { return done(err); }
            this.record = record._id;
            done();
          }.bind(this));
        });

        it("creates a new instance", function (done) {
          this.model.create({foo: 'bar'}).then(function (instance) {
            this.model.DB().collection('model_tests').count({foo: 'bar'}, function (err, count) {
              if (err) { return done(err); }
              assertAsync(done, function () {
                instance.isNew().should.eql(false);
                instance.get('foo').should.eql('bar');
                instance['_*'].foo.should.eql('bar');
                count.should.eql(2);
                assert(instance.get('_id'));
                done();
              });
            });
          }.bind(this));
        });
      });
    });

    describe("getOrInitialize", function () {
      describe("when found", function () {
        beforeEach(function (done) {
          this.subject.set('foo', 'bar');
          this.subject.save(function (err, id) {
            this.record = id;
            done();
          }.bind(this));
        });

        it("returns a single model instance", function (done) {
          this.model.getOrInitialize({foo: 'bar'}, function (err, instance) {
            assertAsync(done, function () {
              instance.get('_id').toString().should.eql(this.record.toString());
              instance.get('foo').should.eql('bar');
              done();
            }.bind(this));
          }.bind(this));
        });

        it("returns an error when more than one result is found", function (done) {
          new this.model({foo: 'bar'}).save(function (err, id) {
            if (err) { done(err); }
            this.model.getOrInitialize({foo: 'bar'}, function (err, instance) {
              assertAsync(done, function () {
                err.name.should.eql('ModelTest.resultError');
                assert.equal(instance, undefined);
                done();
              });
            });
          }.bind(this));
        });
      });

      describe("when not found", function () {
        it("creates a new, unpersisted model instance and applies the passed-in defaults", function (done) {
          this.model.getOrInitialize({foo: 'bar'}, {defaults: {
            foo: 'bar',
            fizz: {
              buzz: 'bzzzz'
            }
          }}, function (err, instance) {
            if (err) { return done(err); }
            this.model.DB().collection('model_tests').count(function(err, count) {
              assertAsync(done, function () {
                count.should.eql(0);
                assert.equal(instance.get('_id'), undefined);
                instance.get('foo').should.eql('bar');
                instance.get('fizz.buzz').should.eql('bzzzz');
                assert.equal(instance['_*'], undefined);
                done();
              });
            });
          }.bind(this));
        });
      });
    });

    describe("getOrCreate", function () {
      describe("when found", function () {
        beforeEach(function (done) {
          this.subject.set('foo', 'bar');
          this.subject.save(function (err, id) {
            this.record = id;
            done();
          }.bind(this));
        });

        it("returns a single model instance", function (done) {
          this.model.getOrCreate({foo: 'bar'}, {defaults: {
            foo: 'bar'
          }}, function (err, instance) {
            if (err) {
              return done(err);
            }
            assertAsync(done, function () {
              instance.get('_id').toString().should.eql(this.record.toString());
              instance.get('foo').should.eql('bar');
              done();
            }.bind(this));
          }.bind(this));
        });

        it("returns an error when more than one result is found", function (done) {
          new this.model({foo: 'bar'}).save(function (err, id) {
            if (err) { done(err); }
            this.model.getOrCreate({foo: 'bar'}, function (err, instance) {
              assertAsync(done, function () {
                err.name.should.eql('ModelTest.resultError');
                assert.equal(instance, undefined);
                done();
              });
           });
          }.bind(this));
        });

        it("does not create a new record", function (done) {
          this.model.getOrCreate({foo: 'bar'}, {defaults: {
            foo: 'bar'
          }}, function (err, instance) {
            this.model.DB().collection('model_tests').count(function (err, count) {
              assertAsync(done, function () {
                count.should.eql(1);
                done();
              });
            });
          }.bind(this));
        });
      });

      describe("when not found", function () {
        it("creates a new, persisted model instance and applies the passed-in defaults", function (done) {
          this.model.getOrCreate({foo: 'bar'}, {defaults: {
            foo: 'bar'
          }}, function (err, instance) {
            if (err) {
              return done(err);
            }
            this.model.DB().collection('model_tests').find().toArray(function(err, results) {
              if (err) {
                return done(err);
              }
              assertAsync(done, function () {
                instance.get('_id').toString().should.eql(results[0]._id.toString());
                results[0].foo.should.eql('bar');
                instance.get('foo').should.eql('bar');
                assert.equal(instance['_*'].foo, 'bar');
                done();
              });
            }.bind(this));
          }.bind(this));
        });

        it("resolves with the instance", function (done) {
          this.model.getOrCreate({foo: 'bar'}, {defaults: {
            foo: 'bar'
          }}).then(function (instance) {
            assertAsync(done, function () {
              instance.get('foo').should.eql('bar');
              done();
            });
          })
          .catch(function (err) {
            done(err);
          });
        });
      });
    });

    describe("getClassName", function () {
      it("reports its class name", function (done) {
        this.model.getClassName().should.eql('ModelTest');
        done();
      });
    });

    describe("getCollectionName", function () {
      it("reports its database collection name", function (done) {
        this.model.getCollectionName().should.eql('model_tests');
        done();
      });
    });

    describe("ModelError", function () {
      it("returns a new error", function (done) {
        assert((new this.model.Error('foo')) instanceof Error);
        done();
      });
      it("sets its name appropriately", function (done) {
        var err = new this.model.Error('foo');
        err.name.should.eql('ModelTest.fooError');
        done();
      });
    });
  });
});
