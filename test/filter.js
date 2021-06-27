var assert = require('chai').assert
var convert = require('../index')

describe('string equality', function () {
  it('should use ->>', function () {
    assert.equal('data @> \'{ "name": "thomas" }\'', convert('data', {name: 'thomas'}))
  })
  it('should work with multiple', function () {
    assert.equal('(data @> \'{ "a": "a" }\' and data @> \'{ "b": "b" }\')', convert('data', {a: 'a', b: 'b'}))
  })
  it('nesting does exact document matching', function() {
    assert.equal('data->\'test\'=\'{"cat":{"name":"oscar"}}\'::jsonb', convert('data', {test: {cat: {name: 'oscar'}} }))
  })
  it('should support nesting using the dot operator', function() {
    assert.equal('data @> \'{ "test": { "cat": { "name": "oscar" } } }\'', convert('data', {'test.cat.name': 'oscar'}))
  })
})

describe('array equality', function () {
  it('array match', function () {
    assert.equal('data @> \'{ "roles": ["Admin"] }\'', convert('data', {'roles': ['Admin']}))
  })
  it('array match', function () {
    assert.equal('data @> \'{ "roles": ["Admin","2"] }\'', convert('data', {'roles': ['Admin', '2']}))
  })
  it('should use =', function () {
    assert.equal('data @> \'{ "roles": "Admin" }\'', convert('data', {'roles': 'Admin'}))
  })
  it('should matching numeric indexes', function() {
    assert.equal('data->\'roles\'->>0=\'Admin\'', convert('data', {'roles.0': 'Admin'}))
  })
  it('support element matching', function() {
    assert.equal('data @> \'{ "roles": "Admin" }\'', convert('data', {'roles': {$elemMatch: 'Admin'}}))
  })
})

describe('boolean equality', function () {
  it('should use ->', function () {
    assert.equal('data @> \'{ "hidden": false }\'', convert('data', {'hidden': false}))
  })
})

describe('number equality', function () {
  it('should use ->', function () {
    assert.equal('data @> \'{ "age": 5 }\'', convert('data', {'age': 5}))
  })
})

describe('$or', function () {
  it('errors with no parameters', function () {
    assert.throws(() => convert('data', { $or: [] }), '$and/$or/$nor must be a nonempty array')
  })
  it('work with one parameter', function () {
    assert.equal('(data @> \'{ "name": "thomas" }\')', convert('data', {$or: [{name: 'thomas'}]}))
  })
  it('work with two parameters', function () {
    assert.equal('(data @> \'{ "name": "thomas" }\' OR data @> \'{ "name": "hansen" }\')', convert('data', {$or: [{name: 'thomas'}, {name: 'hansen'}]}))
  })
})
describe('$nor', function () {
  it('work with two parameters', function () {
    assert.equal('((NOT data @> \'{ "name": "thomas" }\') AND (NOT data @> \'{ "name": "hansen" }\'))', convert('data', { $nor: [{ name: 'thomas' }, { name: 'hansen' }] }))
  })
})

describe('$and', function () {
  it('errors with no parameters', function () {
    assert.throws(() => convert('data', { $and: [] }), '$and/$or/$nor must be a nonempty array')
  })
  it('work with one parameter', function () {
    assert.equal('(data @> \'{ "name": "thomas" }\')', convert('data', {$and: [{name: 'thomas'}]}))
  })
  it('work with two parameters', function () {
    assert.equal('(data @> \'{ "name": "thomas" }\' AND data @> \'{ "name": "hansen" }\')', convert('data', {$and: [{name: 'thomas'}, {name: 'hansen'}]}))
  })
  it('should work implicitly', function () {
    assert.equal('(data @> \'{ "type": "food" }\' and data->\'price\'<\'9.95\'::jsonb)', convert('data', { type: 'food', price: { $lt: 9.95 } }))
  })
})

describe('$in', function () {
  it('should work with strings', function () {
    assert.equal('data->>\'type\' IN (\'food\', \'snacks\')', convert('data', { type: { $in: [ 'food', 'snacks' ] } }))
  })
  it('should work with numbers', function () {
    assert.equal('data->\'count\' IN (\'1\'::jsonb, \'5\'::jsonb)', convert('data', { count: { $in: [ 1, 5 ] } }))
  })
})

describe('$nin', function () {
  it('should work with strings', function () {
    assert.equal('data->>\'type\' NOT IN (\'food\', \'snacks\')', convert('data', { type: { $nin: [ 'food', 'snacks' ] } }))
  })
  it('should work with numbers', function () {
    assert.equal('data->\'count\' NOT IN (\'1\'::jsonb, \'5\'::jsonb)', convert('data', { count: { $nin: [ 1, 5 ] } }))
  })
})

describe('$not', function () {
  it('should add NOT and wrap in paratheses', function () {
    assert.equal('(NOT data->>\'name\' IN (\'thomas\', \'test\'))', convert('data', { name: { $not : {$in: ['thomas', 'test'] } } }))
  })
  xit('should use != for string comparison', function () {
    assert.equal('data->>\'name\'!=\'thomas\'', convert('data', { $not : {name: 'thomas'} }))
  })
})

describe('comparision operators', function() {
  it('$eq', function () {
    assert.equal('data @> \'{ "type": "food" }\'', convert('data', { type: { $eq : 'food' } }))
    assert.equal('data @> \'{ "type": "food" }\'', convert('data', { type : 'food' }))
    assert.equal('data @> \'{ "address": { "city": "provo" } }\'', convert('data', { 'address.city': 'provo' }))
  })
  it('$eq inside array', function () {
    assert.equal('data->\'types\'->>0=\'food\'', convert('data', { 'types.0': { $eq : 'food' } }))
  })
  it('$ne', function () {
    assert.equal('NOT data @> \'{ "type": "food" }\'', convert('data', { type: { $ne : 'food' } }))
  })
  it('$gt', function () {
    assert.equal('data->\'count\'>\'5\'::jsonb', convert('data', { count: { $gt : 5 } }))
  })
  it('$gte', function () {
    assert.equal('data->\'count\'>=\'5\'::jsonb', convert('data', { count: { $gte : 5 } }))
  })
  it('$lt', function () {
    assert.equal('data->\'count\'<\'5\'::jsonb', convert('data', { count: { $lt : 5 } }))
  })
  it('$lte', function () {
    assert.equal('data->\'count\'<=\'5\'::jsonb', convert('data', { count: { $lte : 5 } }))
  })
})

describe('regular expressions', function() {
  it('basic', function () {
    assert.equal('data->>\'type\' ~ \'(?p)food\'', convert('data', { type: { $regex : 'food' } }))
  })
  it('case insensitive', function () {
    assert.equal('data->>\'type\' ~* \'(?p)food\'', convert('data', { type: { $regex : 'food', $options: 'i' } }))
  })
  it('js RegExp', function () {
    assert.equal('data->>\'type\' ~ \'food\'', convert('data', { type: /food/ }))
  })
  it('js RegExp using regex', function () {
    assert.equal('data->>\'type\' ~ \'(?p)food\'', convert('data', { type: { $regex: /food/ }}))
  })
  it('make dot match multiline', function () {
    assert.equal('data->>\'type\' ~* \'food\'', convert('data', { type: { $regex : 'food', $options: 'si' } }))
  })
})

describe('combined tests', function () {
  it('should handle ANDs and ORs together', function() {
    assert.equal('(data @> \'{ "type": "food" }\' and (data->\'qty\'>\'100\'::jsonb OR data->\'price\'<\'9.95\'::jsonb))', convert('data', {
      type: 'food',
      $or: [ { qty: { $gt: 100 } }, { price: { $lt: 9.95 } } ]
    }))
  })
  it('should add NOT and wrap in paratheses', function () {
    assert.equal('(data @> \'{ "city": "provo" }\' and data->\'pop\'>\'1000\'::jsonb)', convert('data', {city: 'provo', pop : { $gt : 1000 } }))
  })
})

describe('$size', function () {
  it('match array sizes', function() {
    assert.equal('jsonb_array_length(data->\'arr\')=3', convert('data', { arr: { $size: 3 } }))
  })
  it('fail for strings', function() {
    assert.throws(() => convert('data', { arr: { $size: 'abc' } }), '$size only supports positive integer')
  })
  it('fail for decimals', function() {
    assert.throws(() => convert('data', { arr: { $size: 3.5 } }), '$size only supports positive integer')
  })
})

describe('$type', function () {
  it('match strings', function() {
    assert.equal('jsonb_typeof(data->\'var\')=\'string\'', convert('data', { var: { $type : 'string' } }))
  })
})

describe('$exists', function () {
  it('work at top level', function() {
    assert.equal('data ? \'name\'', convert('data', { name: { $exists: true } }))
  })
  it('with dot paths', function() {
    assert.equal('data->\'name\' ? \'first\'', convert('data', { 'name.first': { $exists: true } }))
  })
})

describe('$mod', function () {
  it('basic support', function() /**/{
    assert.equal('cast(data->>\'age\' AS numeric) % 2=1', convert('data', { age: { $mod: [2, 1] } }))
  })
})

describe('Match a Field Without Specifying Array Index', function () {
  it('basic case', function() {
    assert.equal('(data @> \'{ "courses": { "distance": "5K" } }\' OR EXISTS (SELECT * FROM jsonb_array_elements' +
        '(data->\'courses\') WHERE jsonb_typeof(data->\'courses\')=\'array\' AND value @> \'{ "distance": "5K" }\'))',
    convert('data', { 'courses.distance': '5K' }, ['courses', 'other']))
  })
  it('basic case matching object', function() {
    assert.equal('(data->\'courses\'=\'{"distance":"5K","loop":true}\'::jsonb OR EXISTS (SELECT * FROM' +
        ' jsonb_array_elements(data->\'courses\') WHERE jsonb_typeof(data->\'courses\')=\'array\' AND' +
        ' value=\'{"distance":"5K","loop":true}\'::jsonb))',
    convert('data', { 'courses': { distance: '5K', loop: true } }, ['courses']))
  })
  it('basic deep case', function() {
    assert.equal('(data @> \'{ "courses": { "distance": "5K" } }\' OR EXISTS (SELECT * FROM jsonb_array_elements' +
        '(data->\'courses\'->\'distance\') WHERE jsonb_typeof(data->\'courses\'->\'distance\')=\'array\' AND value @> \'"5K"\'))',
    convert('data', { 'courses.distance': '5K' }, ['courses.distance']))
  })
  it('direct match', function() {
    assert.equal('(data @> \'{ "roles": "Admin" }\' OR EXISTS (SELECT * FROM jsonb_array_elements(' +
        'data->\'roles\') WHERE jsonb_typeof(data->\'roles\')=\'array\' AND value @> \'"Admin"\'))',
    convert('data', { 'roles': 'Admin' }, ['roles']))
  })
  it('$in', function() {
    assert.equal('(data->>\'roles\' IN (\'Test\', \'Admin\') OR EXISTS (SELECT * FROM jsonb_array_elements(' +
        'data->\'roles\') WHERE jsonb_typeof(data->\'roles\')=\'array\' AND value #>>\'{}\' IN (\'Test\', \'Admin\')))',
    convert('data', { 'roles': { $in: ['Test', 'Admin'] } }, ['roles']))
  })
  it('$all', function() {
    assert.equal('(data @> \'{ "roles": { "$all": ["Test","Admin"] } }\' OR (EXISTS (SELECT * ' +
        'FROM jsonb_array_elements(data->\'roles\') WHERE jsonb_typeof(data->\'roles\')=\'array\' ' +
        'AND value @> \'"Test"\') AND EXISTS (SELECT * FROM jsonb_array_elements(data->\'roles\') ' +
        'WHERE jsonb_typeof(data->\'roles\')=\'array\' AND value @> \'"Admin"\')))',
    convert('data', { 'roles': { $all: ['Test', 'Admin'] } }, ['roles']))
  })
  it('with another array', function() {
    assert.equal('(data @> \'{ "roles": ["Test","Admin"] }\' OR EXISTS (SELECT * FROM jsonb_array_elements(data->\'roles\') WHERE jsonb_typeof(data->\'roles\')=\'array\' AND value @> \'["Test","Admin"]\'::jsonb))',
      convert('data', { 'roles': ['Test', 'Admin'] }, ['roles']))
  })
})
describe('special cases', function () {
  it('should return true when passed no parameters', function() {
    assert.equal('TRUE', convert('data', {}))
  })
})

describe('options.disableContainmentQuery', function () {
  it('should use ->> operator instead of containment when options.disableContainmentQuery is passed', function (){
    assert.equal('(data->>\'a\'=\'1111\' and data->\'b\'=\'123\'::jsonb)', 
      convert('data', { a: '1111', b: 123 }, {disableContainmentQuery: true}))
  })
})
