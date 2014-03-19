## Promise-based wrapper for node-orm2

This lib supplies promise-returning methods for your habitual node-orm2 objects:

```js
var orm = require('orm');
var qOrm = require('q-orm');

return qOrm.qConnect('mysql://username:password@host/database')
.then(function (db) {

	var Person = db.qDefine("person", {
		name      : String,
		surname   : String,
		age       : Number,
		male      : Boolean,
		continent : [ "Europe", "America", "Asia", "Africa", "Australia", "Antartica" ], // ENUM type
		photo     : Buffer, // BLOB/BINARY
		data      : Object // JSON encoded
	}, {
		methods: {
			fullName: function () {
				return this.name + ' ' + this.surname;
			}
		},
		validations: {
			age: orm.enforce.ranges.number(18, undefined, "under-age")
		}
	});

	return Person.qAll({ surname: "Doe" })
	.then(function (people) {
		// SQL: "SELECT * FROM person WHERE surname = 'Doe'"

		console.log("People found: %d", people.length);
		console.log("First person: %s, age %d", people[0].fullName(), people[0].age);

		people[0].age = 16;
		return people[0].qSave()
		.fail(function (err) {
			console.log(err.stack);
		});
	});
})
.fail(function (err) {
	throw err;
});
```

##Supported methods

- `qOrm.qConnect`
- `db.qDefine, db.qExecQuery`
- `Model.qCreate, Model.qGet, Model.qOne, Model.qAll, Model.qCount, Model.qHasOne, Model.qHasMany`
- `instance.qSave, instance.qRemove, instance.qValidate`
- `instance.qGetAssociatedModel`, etc.

##Notes

- All methods inherit their habitual parameters from their callback-based counterparts. (Behind the scenes, we use `Q.nbind`.)
- This is very beta! Works on my application (it's been tested extensively in there), but does not have its own unit tests yet.
- Features such as `orm.enforce`, `orm.eq`, etc. are not wrapped. If you need them (such as in the example), you have to `require('orm')` as well.

##TODO

- Tests
- More examples
- Better README