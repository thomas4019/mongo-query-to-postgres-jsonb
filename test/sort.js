var assert = require('chai').assert
var mongoQueryPostgres = require('../index')
var convertSort = mongoQueryPostgres.convertSort

describe('sort: ', function() {
  it('empty', function () {
    assert.equal(convertSort('data', {}), '')
  })

  it('basic ascending', function () {
    assert.equal(convertSort('data', { field: 1 }), 'data->\'field\' ASC NULLS FIRST')
  })

  it('descending', function () {
    assert.equal(convertSort('data', { field: -1 }), 'data->\'field\' DESC NULLS LAST')
  })

  it('combined', function () {
    assert.equal(convertSort('data', { field: -1, b: 1 }), 'data->\'field\' DESC NULLS LAST, data->\'b\' ASC NULLS FIRST')
  })
})
