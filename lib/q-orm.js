'use strict';

var P		= require('bluebird'),
	orm		= require('orm'),
	connect = P.promisify(orm.connect, orm),
	events	= require('events');

var ucfirst = require('./helpers.js').ucfirst;

exports.qConnect = function (configs) {
	return connect(configs)
	.then(setupConnectionMethods);
};

function setupConnectionMethods(connection) {

	connection.qDefine = defineModel.bind(connection);
	if (connection.driver.execSimpleQuery)
		connection.qExecQuery = P.promisify(connection.driver.execSimpleQuery, connection.driver);

	return connection;
}

function defineModel(name, properties, opts) {
	var connection = this;

	if (!opts) {
		opts = {};
	}
	var Model = P.promisifyAll(connection.define(name, properties, opts));

	Model.events = new events.EventEmitter();

	Model.oneAssociations = [];
	Model.manyAssociations = [];

	Model.qCreate = function () {
		return Model.createAsync.apply(Model, Array.prototype.slice.apply(arguments))
		.then(extendInstance);
	};

	Model.qGet = function () {
		return Model.getAsync.apply(Model, Array.prototype.slice.apply(arguments))
		.then(extendInstance);
	};

	Model.qOne = function () {
		return Model.oneAsync.apply(Model, Array.prototype.slice.apply(arguments))
		.then(extendInstance);
	};

	Model.qAll = function () {
		return Model.allAsync.apply(Model, Array.prototype.slice.apply(arguments))
		.then(extendInstance);
	};

	Model.qCount = Model.countAsync;

	Model.qHasOne = hasOne.bind(Model);
	Model.qHasMany = hasMany.bind(Model);

	setupOneAssociations(Model, opts.hasOne);
	setupManyAssociations(Model, opts.hasMany);
	
	return Model;

}

function hasOne() {
	var Model = this;

	var opts = {};

	var name;
	var OtherModel = Model;

	for (var i = 0; i < arguments.length; i++) {
		switch (typeof arguments[i]) {
			case "string":
				name = arguments[i];
				break;
			case "function":
				if (arguments[i].table) {
					OtherModel = arguments[i];
				}
				break;
			case "object":
				opts = arguments[i];
				break;
		}
	}

	Model.hasOne(name, OtherModel, opts);

	setUpOneAssociation(name, Model, OtherModel, opts);

	if (opts.reverse) {
		setUpManyAssociation(opts.reverse, OtherModel, Model, {
			accessor: opts.reverseAccessor
		});
	}
}

function hasMany() {
	var Model = this;

	var name;
	var OtherModel = Model;
	var props = null;
	var opts = {};

	for (var i = 0; i < arguments.length; i++) {
		switch (typeof arguments[i]) {
			case "string":
				name = arguments[i];
				break;
			case "function":
				OtherModel = arguments[i];
				break;
			case "object":
				if (props === null) {
					props = arguments[i];
				} else {
					opts = arguments[i];
				}
				break;
		}
	}

	Model.hasMany(name, OtherModel, props, opts);

	setUpManyAssociation(name, Model, OtherModel, opts);

	if (opts.reverse) {
		setUpManyAssociation(opts.reverse, OtherModel, Model, {
			accessor: opts.reverseAccessor
		});
	}
}

function extendInstanceWithAssociation(Instance, association) {

	function extendInstanceForAssociation(instance) {
		return extendInstance(instance, association.model);
	}

	var hasAccessor = P.promisify(Instance[association.hasAccessor], Instance),
		getAccessor = P.promisify(Instance[association.getAccessor], Instance),
		setAccessor = P.promisify(Instance[association.setAccessor], Instance),
		delAccessor = Instance[association.delAccessor] && P.promisify(Instance[association.delAccessor], Instance),
		addAccessor = Instance[association.addAccessor] && P.promisify(Instance[association.addAccessor], Instance);

	Object.defineProperty(Instance, 'q'+ucfirst(association.hasAccessor), {
		value: function () {
			return hasAccessor.apply(Instance, Array.prototype.slice.apply(arguments))
			.then(extendInstanceForAssociation);
		},
		enumerable: false
	});
	Object.defineProperty(Instance, 'q'+ucfirst(association.getAccessor), {
		value: function () {
			return getAccessor.apply(Instance, Array.prototype.slice.apply(arguments))
			.then(extendInstanceForAssociation);
		},
		enumerable: false
	});
	Object.defineProperty(Instance, 'q'+ucfirst(association.setAccessor), {
		value: function () {
			return setAccessor.apply(Instance, Array.prototype.slice.apply(arguments))
			.then(extendInstanceForAssociation);
		},
		enumerable: false
	});
	if (!association.reversed) {
		Object.defineProperty(Instance, 'q'+ucfirst(association.delAccessor), {
			value: function () {
				return delAccessor.apply(Instance, Array.prototype.slice.apply(arguments))
				.then(extendInstanceForAssociation);
			},
			enumerable: false
		});
	}
	if (association.addAccessor) {
		Object.defineProperty(Instance, 'q'+ucfirst(association.addAccessor), {
			value: function () {
				return addAccessor.apply(Instance, Array.prototype.slice.apply(arguments))
				.then(extendInstanceForAssociation);
			},
			enumerable: false
		});
	}
}

function extendInstance(instances, MyModel) {

	if (instances === null || instances === []) {
		return null;
	}

	if (Array.isArray(instances)) {
		return P.map(instances, function (instance) {
			return extendInstance(instance, MyModel);
		});
	}

	var instance = instances;

	if (instance.isExtended) {
		return instance;
	}

	if (!MyModel) {
		MyModel = instance.model();
	}

	Object.defineProperty(instance, 'qSave', {
		value: P.promisify(instance.save, instance),
		enumerable: false
	});

	Object.defineProperty(instance, 'qRemove', {
		value: P.promisify(instance.remove, instance),
		enumerable: false
	});

	Object.defineProperty(instance, 'qValidate', {
		value: P.promisify(instance.validate, instance),
		enumerable: false
	});

	var i;
	for (i = 0; MyModel.oneAssociations && (i < MyModel.oneAssociations.length); i++) {
		extendInstanceWithAssociation(instance, MyModel.oneAssociations[i]);
	}

	for (i = 0; MyModel.manyAssociations && (i < MyModel.manyAssociations.length); i++) {
		extendInstanceWithAssociation(instance, MyModel.manyAssociations[i]);
	}

	Object.defineProperty(instance, 'isExtended', {
		value: true,
		enumerable: false
	});

	if (MyModel.qAfterLoad) {
		return MyModel.qAfterLoad.apply(instance);
	}

	return instance;
}

function setUpOneAssociation(name, Model, OtherModel, opts) {
	var assocName = opts.name || ucfirst(name);
	var assocTemplateName = opts.accessor || assocName;

	var association = {
		model		   : OtherModel,
		getAccessor    : opts.getAccessor || ("get" + assocTemplateName),
		setAccessor    : opts.setAccessor || ("set" + assocTemplateName),
		hasAccessor    : opts.hasAccessor || ("has" + assocTemplateName),
		delAccessor    : opts.delAccessor || ("remove" + assocTemplateName)
	};
	Model.oneAssociations.push(association);
	Model["qFindBy" + assocTemplateName] = P.promisify(Model["findBy" + assocTemplateName], Model);
}

function setUpManyAssociation(name, Model, OtherModel, opts) {
	var assocName = opts.name || ucfirst(name);
	var assocTemplateName = opts.accessor || assocName;

	var association = {
		model		   : OtherModel,
		getAccessor    : opts.getAccessor || ("get" + assocTemplateName),
		setAccessor    : opts.setAccessor || ("set" + assocTemplateName),
		hasAccessor    : opts.hasAccessor || ("has" + assocTemplateName),
		delAccessor    : opts.delAccessor || ("remove" + assocTemplateName),
		addAccessor    : opts.addAccessor || ("add" + assocTemplateName)
	};
	Model.manyAssociations.push(association);
}

function setupOneAssociations(Model, hasOne) {
	if (!hasOne) {
		return;
	}

	var assoc;
	for (var name in hasOne) {
		assoc = hasOne[name];
		Model.qHasOne(name, assoc.model, assoc.opts);
	}
}

function setupManyAssociations(Model, hasMany) {
	if (!hasMany) {
		return;
	}

	var assoc;
	for (var name in hasMany) {
		assoc = hasMany[name];
		Model.qHasMany(name, assoc.model, assoc.extra, assoc.opts);
	}
}