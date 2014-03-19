'use strict';

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