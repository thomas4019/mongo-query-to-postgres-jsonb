var assert = require('chai').assert;
var convert = require('../index')

describe('string equality', function () {
	it('should use ->>', function () {
		assert.equal("data->>'name'='thomas'", convert('data', {name: 'thomas'}));
	});
	it('nesting does exact document matching', function() {
		assert.equal("data->'test'='{\"cat\":{\"name\":\"oscar\"}}'::jsonb", convert('data', {test: {cat: {name: "oscar"}} }));
	});
	it('should support nesting using the dot operator', function() {
		assert.equal("data->'test'->'cat'->>'name'='oscar'", convert('data', {'test.cat.name': "oscar"}));
	});
});

describe('array equality', function () {
	it('should use =', function () {
		assert.equal("data->'roles'='[\"Admin\"]'::jsonb", convert('data', {'roles': ['Admin']}));
	});
	it('should matching numeric indexes', function() {
		assert.equal("data->'roles'->>0='Admin'", convert('data', {'roles.0': 'Admin'}));
	});
	it('support element matching', function() {
		assert.equal("data->'roles' @> '\"Admin\"'::jsonb", convert('data', {'roles': {$elemMatch: 'Admin'}}));
	});
});

describe('boolean equality', function () {
	it('should use ->', function () {
		assert.equal("data->'hidden'='false'::jsonb", convert('data', {'hidden': false}));
	});
});

describe('$or', function () {
	it('returns false with no parameters', function () {
		assert.equal("FALSE", convert('data', {$or: []}));
	});
	it('work with one parameter', function () {
		assert.equal("(data->>'name'='thomas')", convert('data', {$or: [{name: 'thomas'}]}));
	});
	it('work with two parameters', function () {
		assert.equal("(data->>'name'='thomas' OR data->>'name'='hansen')", convert('data', {$or: [{name: 'thomas'}, {name: 'hansen'}]}));
	});
});

describe('$and', function () {
	it('returns true with no parameters', function () {
		assert.equal("TRUE", convert('data', {$and: []}));
	});
	it('work with one parameter', function () {
		assert.equal("(data->>'name'='thomas')", convert('data', {$and: [{name: 'thomas'}]}));
	});
	it('work with two parameters', function () {
		assert.equal("(data->>'name'='thomas' AND data->>'name'='hansen')", convert('data', {$and: [{name: 'thomas'}, {name: 'hansen'}]}));
	});
	it('should work implicitly', function () {
		assert.equal("(data->>'type'='food' and data->'price'<'9.95'::jsonb)", convert('data', { type: 'food', price: { $lt: 9.95 } }));
	});
});

describe('$in', function () {
	it('should work with strings', function () {
		assert.equal("data->>'type' IN ('food', 'snacks')", convert('data', { type: { $in: [ 'food', 'snacks' ] } }));
	});
	it('should work with numbers', function () {
		assert.equal("data->'count' IN ('1'::jsonb, '5'::jsonb)", convert('data', { count: { $in: [ 1, 5 ] } }));
	});
});

describe('$nin', function () {
	it('should work with strings', function () {
		assert.equal("data->>'type' NOT IN ('food', 'snacks')", convert('data', { type: { $nin: [ 'food', 'snacks' ] } }));
	});
	it('should work with numbers', function () {
		assert.equal("data->'count' NOT IN ('1'::jsonb, '5'::jsonb)", convert('data', { count: { $nin: [ 1, 5 ] } }));
	});
});

describe('$not', function () {
	it('should add NOT and wrap in paratheses', function () {
		assert.equal("(NOT data->>'name'='thomas')", convert('data', { $not : {name: 'thomas'} }));
	});
});

describe('comparision operators', function() {
	it('$eq', function () {
		assert.equal("data->>'type'='food'", convert('data', { type: { $eq : 'food' } }));
	});
	it('$ne', function () {
		assert.equal("data->>'type'!='food'", convert('data', { type: { $ne : 'food' } }));
	});
	it('$gt', function () {
		assert.equal("data->'count'>'5'::jsonb", convert('data', { count: { $gt : 5 } }));
	});
	it('$gte', function () {
		assert.equal("data->'count'>='5'::jsonb", convert('data', { count: { $gte : 5 } }));
	});
	it('$lt', function () {
		assert.equal("data->'count'<'5'::jsonb", convert('data', { count: { $lt : 5 } }));
	});
	it('$lte', function () {
		assert.equal("data->'count'<='5'::jsonb", convert('data', { count: { $lte : 5 } }));
	});
});

describe('combined tests', function () {
	it('should handle ANDs and ORs together', function() {
		assert.equal('(data->>\'type\'=\'food\' and (data->\'qty\'>\'100\'::jsonb OR data->\'price\'<\'9.95\'::jsonb))', convert('data', {
			type: 'food',
			$or: [ { qty: { $gt: 100 } }, { price: { $lt: 9.95 } } ]
		}));
	});
	it('should add NOT and wrap in paratheses', function () {
		assert.equal("(data->>\'city\'=\'provo\' and data->\'pop\'>\'1000\'::jsonb)", convert('data', {city: 'provo', pop : { $gt : 1000 } }));
	});
});

describe('special cases', function () {
	it('should return true when passed no parameters', function() {
		assert.equal('TRUE', convert('data', {}));
	});
});