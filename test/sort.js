var assert = require('chai').assert
var mongoQueryPostgres = require('../index')
var convertSort = mongoQueryPostgres.convertSort

describe('sort: ', function() {
  it('empty', function () {
    assert.equal(convertSort('data', {}), '');
  })

  it('basic ascending', function () {
    assert.equal(convertSort('data', { field: 1 }), "data->'field' ASC");
  })

  it('descending', function () {
    assert.equal(convertSort('data', { field: -1 }), "data->'field' DESC");
  })

  it('combined', function () {
    assert.equal(convertSort('data', { field: -1, b: 1 }), "data->'field' DESC, data->'b' ASC");
  })
})
