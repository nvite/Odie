# Odie

A schemaless, context-oriented Object Document Mapper for Node.js and MongoDB

---

## Rationale

MongoDB is a schemaless, document-oriented database. It's great for prototyping
and running alpha software that lacks institutional _domain wisdom_. In an environment
where requirements are constantly being better understood and subsequently redefined, MongoDB
is an ideal fit. In such an environment, dogmatic schema consistency can be an impediment--you
as a developer know when you need consistency and when you don't, and you also deserve something
better than JSON fields when dealing with the parts that don't.

Odie was extracted from just such an environment, designed to meet the data needs that were already
established while not imposing rigidity where it wasn't called for. An odie model looks like JS code,
not a giant object of intermingled schema definitions and frameworky callback handlers. You get to
impose your own domain rules on a model-by-model basis, and Odie handles things like finders,
persistence, formatting and field cleanup for you.

---

## Getting started

Odie exposes its business logic via Model classes, which are prototypes decorated with
Odie's sole export, `Model`.

### Defining a model

Let's create a model, `ToDoList`. The definition at its most basic is almost too simple to be true:

```javascript
var Model = require('odie');

function ToDoList(attrs) {
  this.initializeWith(attrs);
}

module.exports = Model(ToDoList, 'to\_do\_lists');
```

You now have a full-fledged model, `ToDoList` which can interact with
the database collection 'to\_do\_lists' and do all the things a model should.

### Creating an instance

Instantiating is also as straightforward as you'd expect (and completely definable by you!).
In this basic setup, we can create a new To Do List from a plain object:

```javascript
// assuming your ToDoList model is defined in ./models/to-do-list.js
var ToDoList = require('./models/to-do-list');
var myList = new ToDoList({
  name: "My To-Do List",
  items: [
    { name: 'Write docs', completed: false },
    { name: 'Publish v0.1.0', completed: false }
  ]
});
```

Because we called `this.initializeWith` in our constructor, we've now got a ToDoList instance
populated with our passed-in attributes at our disposal. To persist it, we can just call:

```javascript
myList.save()
  .then(function(instance) {
    console.log('It has an ID now!', instance.get('_id'))
  })
  .catch(function (err) {
    console.error('Whoops', err);
  });
```

Persistence operations expose both a promise and callback interface, so you can
handle responses as you prefer.

### Connecting to a database

So where did your new ToDoList instance go? By default, the `connection` module will connect to `localhost` on the default port, and do its
work in a database called `odie_test`. You can override this behavior in one of two ways:

### Configuration

The `Model` decorator exposes a configuration getter and setter, `configure` and `config`, respectively.
To specify a database for a given model, you use code similar to the following:

```javascript
var Model = require('odie');
Model.configure('uri', 'mongodb://example.com/todo_app?ssl=true');

// define a model...

module.exports = Model(ToDoList);
```

Under the hood, Odie uses a `MongoClient` instance to connect to MongoDB, so the
URI you provide supports the full `MongoClient` URI spec, including ReplicaSets and QueryString options.

You can configure the database one key at a time, as above, or provide an object as the sole argument to `configure`:

```javascript
var Model = require('odie');
Model.configure({
  uri: 'mongodb://example.com/todo_app',
  options: {
    ssl: true
  }
});
```

Any keys/values in `options` will be converted to querystring params and appended to your URI at connection
time. In this manner, config can be pulled directly in from a json file or `process.env`.

### Sharing a DB connection

When grabbing a DB connection for IO, Odie will first check to see if `global.__odiedb__` is defined,
and instantiate its own connection only if not found. So, to share a connection app-wide, or to use your
own MongoDB connection, you could do something like this:

```javascript
// in app.js
var db = require('my-db-connection-code');
db.connect(function (err, conn) {
  global.__odiedb__ = conn;
});
```

And all of your models will then use `conn` instead of opening a DB connection.

### Logging

By default, Odie will use `console` as its logger, but you can specify your own here, as well:

```javascript
// in app.js
var logger = require('my-logger-that-exposes-appropriate-methods');
global.__odielogger__ = logger;
```

Your logger must be an instantiated object (not a prototype), and must respond to these methods:
 - debug
 - info
 - warn
 - error
 - log

[Back to top](#)

---

## Manipulating values

Odie sandboxes its model state in such a way as to isolate it from other properties it may contain,
which means that all persisted values are manipulated by `get` and `set` methods.

### Getters and setters

You can get a value via `instance.get`:

```javascript
myList.get('name');
// => "My To-Do List"
```

Likewise, you can change that value via `instance.set`:

```javascript
myList.set('name', 'My Awesome To-Do List');
myList.get('name');
// => "My Awesome To-Do List"
```

You can retrieve the whole model's state by calling `instance.get` with no arguments:

```javascript
myList.get();
// => {
//   name: "My Awesome To-Do List",
//   items: [
//     { name: 'Write docs', completed: false },
//     { name: 'Publish v0.1.0', completed: false }
//   ]},
//   created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   _id: 000000000000000000000000
// }
```

**Note:** Timestamps were created automatically for us when we saved.

### Deep references

It's possible to get and set values that we're not sure exist. Under the hood, Odie
implements the null object pattern to prevent errors from being thrown where data doesn't
exist (after all, this is a schemaless ODM!). To get a value nested deeply within a model,
we can ask for it with a dot-delimited path:

```javascript
myList.get('items.0.name');
// => "Write docs"

myList.get('items.9.name');
// => undefined
```

Two things to note here:
- We can index into an array via numeric property names, and
- We get back undefined no matter where the undefined value first occurs in the path we've requested.

It's probably also worth noting that while this is fine for setting the value of an array index
that exists, there are better ways to _add_ to an array than by numeric address, which we'll
get into shortly.

We can, however, set a value to a path within an object that doesn't exist:

```javascript
myList.set('sharing.url', 'https://example.com/my-list');
myList.set('sharing.access', 'friends');
myList.get('sharing');
// => 
// {
//   url: "https://example.com/my-list",
//   access: "friends"
// }
```

This can be done to arbitrary depths, any path part along the way that's undefined will be initialized
to an empty object (including numeric paths, be warned!).

### Unsetting a value

Setting a value to undefined is insufficient to remove it from the database. When a value is to be removed,
it should be `unset`:

```javascript
myList.unset('sharing');
```

### Reverting changes

Pending changes can be thrown away via `reset`
```javascript
myList.set('unnecessary_data', 'blah');
myList.reset();
myList.get('unnecessary_data');
// => undefined
```

### Array operations

To better handle arrays, there are specific methods available.

**Note:** `Model.attributeError` will be thrown if array operations are applied
to a non-array reference

**Push**

Adds to the end of an array.

```javascript
myList.push('items', {
  name: 'Coverage stats',
  complete: false
});
myList.get('items.2');
// =>
// {
//   name: 'Coverage stats',
//   complete: false
// }
```

**Unshift**

Adds to the beginning of an array.

```javascript
myList.unshift('items', {
  name: 'Coverage stats',
  complete: false
});
myList.get('items.0');
// =>
// {
//   name: 'Coverage stats',
//   complete: false
// }
```

**Splice**

Removes a slice of the array by index. This is the preferred way to remove any
items from an array.

```javascript
myList.splice('items', 1, 1);
myList.get('items');
// => 
// [
//   { name: 'Coverage stats', complete: false },
//   { name: 'Publish v0.1.0', completed: false }
// ]
```

[Back to top](#)

---

## Persistence

### Dirty tracking

Odie keeps track of the fields that have changed as we manipulate our model. We
can find out if a field has changed with the `isDirty` method:

```javascript
myList.isDirty('items');
// => true
```

We can find out if the model has any changes at all by calling `isDirty` with no arguments:
```javascript
myList.isDirty();
// => true
```

We can also get a list of changed fields with the `dirtyFields` method:
```javascript
myList.dirtyFields();
// => ["name", "items"];
```

Note that when only a single property nested within an object is changed, the field returned will be a
dot-delimited path.

### Field whitelisting & contexts

It's stated above that Odie is _context-oriented_. This derives from the idea that different users have different
relationships to the data, and Odie lets you define those relationships as simple strings. Each _context_ can have
a whitelist of fields they're allowed to read and write, and the caller can specify which context to use.

By default, every field is readable and writable, but once a context is created, all fields become restricted.
`Model.writable` is the interface by which writable fields are defined. Let's make our to-do list editable only by the
'self' context:

```javascript
var Model = require('odie');
function ToDoList(attrs) {
  this.initializeWith(attrs);
}
Model(ToDoList);

ToDoList.writable('self', ['name', 'items']);

module.exports = ToDoList;
```

Now when we save our model with the `self` context, any changes that are not to the fields `name`
or `items` will not be persisted:

```javascript
myList.set('sharing', { url: 'https://example.com/my-list', access: 'friends' });
myList.save({ as: 'self' })
  .then(function () {
    console.log(myList.get())
  });
// => Setting a value for `sharing` is disallowed, rolling it back.
// => 
// {
//   name: "My Awesome To-Do List",
//   items: [
//     { name: 'Write docs', completed: false },
//     { name: 'Publish v0.1.0', completed: false }
//   ]},
//   created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   _id: 000000000000000000000000
// }
```

Note that we provided an options object with `{as: 'self'}` to our save method. This
tells the model to save using the 'self' context that we've defined with `ToDoList.writable`.

### The default context

Now that there's a write context called 'self', calls to `save` with no `as` option
will essentially be no-ops. We need a default context if we want to write fields without specifying
who is doing the writing. We can do this by using `writable` without a string first argument:

```javascript
ToDoList.writable(['name']);
```

Now, anyone can change the name of my to do list.

Writable fields are stored as class attributes of the Model itself, and can be
accessed directly allowing contexts to be built up with permission levels:

```javascript
ToDoList.writable(['name']);
ToDoList.writable('editor', ToDoList.READABLE_PROPERTIES.default.concat('items'));
ToDoList.writable('owner', ToDoList.READABLE_PROPERTIES.editors.concat('sharing'));
```

Now we have 3 contexts: the default, one called 'editor', and one called 'owner', each
with more writable fields than the last.

### Other contexts

We have the same access to contexts when serializing a model for output, using a method called `readable`,
which works in the same way.

There is also a shorthand for setting both `readable` and `writable` at once, called `accessible`.

More on field redaction for output can be found in the section 'Formatting output' below.

### Partial edits

Sometimes an application recieves a payload that contains a partial object which should be merged into
a model rather than replace its content. To facilitate these types of updates, there is a method, `updateWith`
provided in addition to `save`. `updateWith` accepts an object and will do a merge save, replacing any defined
properties while leaving undefined ones untouched:

```javascript
myList.updateWith({
    sharing: {
      url: 'https://example.com/my-list',
      access: 'friends'
    }
  }, {as: 'owner'})
  .then(function () {
    console.log(myList.get())
  });
// => 
// {
//   name: "My Awesome To-Do List",
//   items: [
//     { name: 'Write docs', completed: false },
//     { name: 'Publish v0.1.0', completed: false }
//   ]},
//   sharing: {
//     url: 'https://example.com/my-list',
//     access: 'friends'
//   }
//   created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   _id: 000000000000000000000000
// }
```

It's notable that this style of update uses `save` internally and will clean fields based
on the permissions model you've defined.

### Atomic operations

Sometimes you want to just write to the database, and that's possible with an Odie model as well, using `directUpdate`.
This method is good for atomic operations like `$inc`, and also when you just want to pass a `$set` or `$unset` straight through.
No call to `save` is made and no field cleaning or validation is done.

If an object of properties is passed straight in (ie, no `$` operator),
it will be wrapped in a `$set` operation.

### Creating a record

**Create**

`Model.create(props)` Can be used to initialize and persist a new model in
one step, resolving with the instance.

```javascript
ToDoList.create({
  name: "My Other List",
  items: []
}).then(console.log);
// => <ToDoList: 000000000000000000000001>
```
By the way, the console representation of our ToDoList instance above
defaults to `<ModelName: ObjectId>`, but the right side of the colon can be overridden
by defining the method `toString` in your model.

**getOrCreate**

A model can be retrieved or created if it doesn't exist, using `getOrCreate`,
with the signature `(query, options)`, where `options.defaults` contains the properties to
create a new instance with.

```javascript
ToDoList.getOrCreate({
  name: "My Awesome To-Do List"
}, {
  defaults: {
    name: "My Awesome To-Do List",
    items: []
  }
})
.then(console.log);
// => <ToDoList: 000000000000000000000000>
```

**getOrInitialize**

Just like `getOrCreate`, only without saving to the database.

### Deleting a record

A model can be removed from the database using the syntax `myList.destroy()`

### Reloading from the database

After a save is successful, the model is reloaded in-place, meaning the data you wrote to the db
is now in the working copy. This is true for all persistence operations except `destroy`, meaning that
after a `directUpdate` which calls `$inc` on a number, the new number will be present in the model's state
after resolution. After a call to `destroy` the original object is left in the model's working copy.

You can reload an instance at any time via `instance.reload()`

[Back to top](#)

---

## Finders

### Retrieving a single instance

A single record can be retrieved via `Model.get`, providing either mongo criteria or an ObjectId-like string:

```javascript
// assuming your ToDoList model is defined in ./models/to-do-list.js
var ToDoList = require('./models/to-do-list');
ToDoList.get('000000000000000000000000')
  .then(console.log);
// => <ToDoList: 000000000000000000000000>

ToDoList.get({'items.0.name': 'Write docs'})
  .then(console.log);
// => <ToDoList: 000000000000000000000000>
```

If more than one result is returned from `get`, an error of type
`ToDoList.resultError` will be returned (and the promise rejected)

`findOne` and `findById` are synonyms for `get`.

### Multiple instances & QuerySets

Queries for multiple records return a QuerySet, a class which wraps a MongoDB cursor
and automatically populates instances as the cursor yields data.
You can get a queryset by calling `Model.find` or `Model.all`:

```javascript
var qs = ToDoList.find({'items.complete': false});
console.log(qs);
// => <QuerySet: ToDoList>
```

QuerySets support most of the MongoDB cursor spec, and always return themselves,
so methods can be chained:

```javascript
qs.batchSize(2)
  .limit(10)
  .sort({created_at: desc})
  .count(console.log)
  .rewind()
  .explain(console.log);
```

### QuerySet methods delegated to the cursor

The following methods are delegated straight to the MongoDB Cursor and can be understood via its [documentation](https://mongodb.github.io/node-mongodb-native/api-generated/cursor.html):
- `hint` (where available)
- `batchSize`
- `limit`
- `skip`
- `sort`
- `count`
- `rewind`
- `explain`

### QuerySet iterators

Available iterators are:

**forEach**

Iterates over the cursor, performing the callback with each. This method respects
batchSize with regard to cursor memory use.

```javascript
qs.forEach(function (err, result) {
  console.log(result);
});
// => <ToDoList: 000000000000000000000000>
```

**toArray**

Converts the entire cursor to an array, loading all results into memory at once.

```javascript
qs.toArray(function (err, results) {
  console.log(results);
});
// => [<ToDoList: 000000000000000000000000>]
```

**then..catch**

A promise-like version of toArray. Note that this is not a real promise interface.

`then` adds a callback to the queryset to execute when toArray completes, and
`catch` adds an error handler to execute on error. There is no notion of resolution or state, etc.

```javascript
qs.then(console.log)
  .catch(console.log);

// => [<ToDoList: 000000000000000000000000>]
```

**toJSON**

Formats each model in the queryset as a JS object, using the `format` method of each.
A second parameter, `formatOptions` will be passed straight through to each `format` call.
```javascript
qs.toJSON(function (err, results) {
  console.log(results);
}, {as: 'owner'});
// => [{ name: "My Awesome To-Do List", items: [...}]
```

**next**

Calls the supplied callback with the next model in the QuerySet, advancing the cursor by one.
```javascript
qs.next(function (err, result) {
  console.log(result);
});
// => <ToDoList: 000000000000000000000000>
```

**whileNext**

Takes two callbacks. Performs a while loop, yielding instances to the first as long as they remain on the cursor,
and calls the second on completion, or with an error if encountered.

```javascript
qs.whileNext(function (err, result){
  console.log(result);
}, function (err) {
  console.log('Done!');
});
// => <ToDoList: 000000000000000000000000>
// => Done!
```

[Back to top](#)

---

## Formatting output

Each model exposes a `format` method, for converting its internal state to a plain JS object
for interoperability with other systems. Think of `format` as the external representation of your model
from an end-user's perspective--it returns the value an API might return, for example.

### Readable contexts

The default behavior of `format` is to just return the current state, the same way `instance.get()` would,
but Odie also supports 'readable contexts', the same way it does for persistence.

If readable contexts are defined, the `as` option must be provided--as with save--to determine which
fields should be present in the output. Defining readable contexts looks like this:

```javascript
ToDoList.readable(['name']) // the default has no context name
ToDoList.readable('editor', ToDoList.READABLE_PROPERTIES.default.concat('items'));
ToDoList.readable('owner', ToDoList.READABLE\_PROPERTIES.editor.concat(['sharing', 'created\_at', 'updated_at']));
```

Once contexts are created, they can be used on format:

```javascript
myList.format({as: 'editor'});
// =>
// {
//   name: "My Awesome To-Do List",
//   items: [
//     { name: 'Write docs', completed: false },
//     { name: 'Publish v0.1.0', completed: false }
//   ]},
//   _id: 000000000000000000000000
// }
```

[Back to top](#)

---

## Overriding methods

Readable properties go a long way toward customizing the serialization output of a model, but sometimes
internal storage and external representation don't match up at all. Likewise, pre- and post-save hooks
are common requirements of any database abstraction layer. To achieve this level of customization, Odie
allows any stock method to be overridden.

### By redefinition

Any method can be redefined by a model, after applying the `Model` decorator--just redefine it in the prototype:

```javascript
function ToDoList (props) {
  this.initializeWith(props);
}
Model(ToDoList);

ToDoList.prototype.save(options) {
  // your custom save method here
}
```

This skips the builtin `save` entirely, so you're responsible for everything.

### By `overrides`

Odie also provides a higher-order method, `overrides`, to facilitate wrapping a builtin method. The signature looks like
`(methodName, implementation)` where `methodName` is the string name to override, and `implementation`
is a function that receives the original method, and returns a function with the same signature
as the original method.

A trivial example of overriding `save`:

```javascript
ToDoList.overrides('save', function overrideSave (super) {

  return function customSave (options) {
    console.log('About to save ToDoList with id:', this.get('_id'));

    return super(options)
      
      .then(function (id) {
        console.log('Succesfully saved ToDoList with id:', this.get('_id'));
      }.bind(this))
      
      .catch(function (err){
        console.log('Failed to save ToDoList with id:', this.get('_id'), 'Error:', err);
      }.bind(this));
  }
});
```

Now, when you call `save`, your implementation will be used while still delegating to
the builtin at the designated point. Any model method can be overridden in this fashion.

[Back to top](#)

---

## Memoization

Sometimes models must rely on expensive-to-compute or remote data which should only
be retrieved once and then saved for later. Odie provides mechanisms for defining--and
preloading at the QuerySet level--these kinds of data. To implement a memoizer, use the
higher-order method `memoizes`, with the signature `(getterName, memoizedName, implementation)`
where `getterName` is the function to be added to the model's prototype, memoizedName is an all-caps
attribute to store the data on the model (separate from the model's state data), and implementation
is a getter that returns a promise for the data to be assigned into `instance.memoizedName`.

Memoized methods always return a promise, but the property the data are stored on
can be accessed directly to return results in the current tick.

A trivial example of memoizing a remote data call:

```javascript
var request = require('request');
var Q = require('q');

ToDoList.memoizes('getRemoteThing', 'REMOTE_THING', function innerGetRemoteThing () {
  var dfd = Q.defer();
  request.get('https://example.com/data.json', function (err, resp, body) {
    if (err) {
      return dfd.reject(err);
    }
    dfd.resolve(JSON.parse(body));
  });
  return dfd.promise;
});
```

This adds a method, `getRemoteThing` to our model's prototype which will call the remote data once
and store it for immediate retrieval on subsequent calls:

```javascript
myList.getRemoteThing()
  .then(console.log);
// => { result: 'some data' }

console.log(myList.__REMOTE_THING__);
// => { result: 'some data' }
```

**Note:** Double underscores are prepended and appended and the given
attribute name is uppercased automatically.

Any memoized method can be forced to re-fetch its data by providing an
object, `{force: true}` to the getter.

### Preloading memoized getters from a QuerySet

It can be useful to preload memoized data at the QuerySet level to ensure that every instance
that gets iterated on has memoized values all ready to go:

```javascript
ToDoList
  .all()
  .batchSize(10)
  .preload('getRemoteThing')
  .forEach(function (err, list) {
    console.log(list.__REMOTE_THING__);
  });
// => { result: 'some_data' }
```

### Preloading memoized getters from a single-record `get`

A `preload` option can also be given to `Model.get` to preload memoized methods:

```javascript
ToDoList.get({_id: someObjectId}, {preload: ['getRemoteThing', 'someOtherThing']})
  .then(function (list) {
    console.log(list.__REMOTE_THING__);
  });
// => { result: 'some_data' }
```

[Back to top](#)

---

## Relations

The idea of memoized getters combined with an overridden `format`
method can be used to eagerly fetch and inline relationships or remote data on a document. Proper relation support is 
still experimental and a formal API around it will materialize as use patterns are understood, but for the time
being, it's still doable somewhat manually. Here's a naïve example impementation:

```javascript
var model = require('odie');
var Q = require('q');

// define a Person
function Person (props) {
  this.initializeWith(props);
}
Model(Person, 'people');

// define a Group, with members
function Group(props) {
  this.initializeWith(props);
}
Model(Group, 'groups');
Group.memoizes('getMembers', 'MEMBERS', function () {
  var dfd = Q.defer();
  var out = {};
  Person.find({ _id: {$in: this.get('members')}})
    .nextWhile(function (err, member) {
      out[member.get('_id').toString()] = member;
    }, function (err) {
      if (err) { dfd.reject(err); }
      dfd.resolve(out);
    });
  return dfd.promise;
});
Group.overrides('format', function (super) {
  return function customFormat (options) {
    options || (options = {});
    if (this.__MEMBERS__) {
      this.get('members', []).forEach(function (memberId, i) {
        this.set('members.' + i, this.__MEMBERS__[memberId.toString()].format());
      }.bind(this));
    }
    var out = super();
    this.reset();
    return (out);
  };
});

Q.all([
  Person.create({ name: 'Dan', age: '33' }),
  Person.create({ name: 'Evan', age: '24' })
  ])
  .then(function (results) {
    return Group.create({
      name: "My Group",
      members: results
    });
  })
  .then(function (group) {
    group.getMembers()
      .then(function () {
        console.log(group.format);
      });
  });
// =>
// {
//   name: "My Group",
//   members: [
//     { 
//       name: "Dan",
//       age: "33",
//       _id: 000000000000000000000000,
//       created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//       updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//     },
//     { 
//       name: "Evan",
//       age: "24",
//       _id: 000000000000000000000001,
//       created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//       updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//     },
//   ],
//   _id: 000000000000000000000000,
//   created_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT),
//   updated_at: Wed Aug 12 2015 10:12:00 GMT-0400 (EDT)
// }
```

[Back to top](#)

---

## That's it!

Questions and issues can be directed to the Github repo: <https://github.com/nvite/odie/issues>
