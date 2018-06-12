var assert = require('chai').assert
var mongoQueryPostgres = require('../index')
var convertSelect = mongoQueryPostgres.convertSelect

describe('select: ', function() {
  describe('wildcard', function () {
    it('wildcards', function () {
      assert.equal(convertSelect('data', undefined), 'data')
      assert.equal(convertSelect('data', {}), 'data')
    })
  })

  describe('named fields', function () {
    it('single field', function () {
      assert.equal(convertSelect('data', { field: 1 }), 'jsonb_build_object(\'field\', data->\'field\', \'_id\', data->\'_id\') as data')
    })
    it('single field exclude _id', function () {
      assert.equal(convertSelect('data', { field: 1, _id: 0 }), 'jsonb_build_object(\'field\', data->\'field\') as data')
    })
    it('nested field', function () {
      assert.equal(convertSelect('data', { 'field.inner': 1 }), 'jsonb_build_object(\'field\', jsonb_build_object(\'inner\', data->\'field\'->\'inner\'), \'_id\', data->\'_id\') as data')
    })
    it('multiple fields', function () {
      assert.equal(convertSelect('data', { a: 1, b: 1 }), 'jsonb_build_object(\'a\', data->\'a\', \'b\', data->\'b\', \'_id\', data->\'_id\') as data')
    })
    it('multiple fields', function () {
      assert.equal(convertSelect('data', { a: 1, 'b.g': 1, 'b.abc': 1 }), 'jsonb_build_object(\'a\', data->\'a\', \'b\', jsonb_build_object(\'g\', data->\'b\'->\'g\', \'abc\', data->\'b\'->\'abc\'), \'_id\', data->\'_id\') as data')
    })
  })

  describe('excluded fields', function () {
    it('single excluded', function () {
      assert.equal(convertSelect('data', { b: 0 }), "data #- '{b}' as data")
    })
    it('exclude deep', function () {
      assert.equal(convertSelect('data', { 'field.inner': 0 }), "data #- '{field,inner}' as data")
    })
    it('combined exclusion and inclusion', function () {
      assert.throws(() => convertSelect('data', { a: 1, b: 0 }), 'Projection cannot have a mix of inclusion and exclusion.')
    })
  })
})
