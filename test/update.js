var assert = require('chai').assert
var mongoQueryPostgres = require('../index')
var convertUpdate = mongoQueryPostgres.convertUpdate

describe('update: ', function() {
  describe('replace doc', function () {
    it('simple replacement', function() {
      assert.equal(convertUpdate('data', { field: 'value' }), '\'{"field":"value"}\'::jsonb')
    })

    it('cannot mix update operators and keys', function() {
      assert.throws(() => convertUpdate('data', { field: 'value', $set: { a: 'b' } }), 'The <update> document must contain only update operator expressions.')
    })
  })

  describe('operators', function () {
    it('$set', function() {
      assert.equal(convertUpdate('data', { $set: { field: 'value' } }), 'jsonb_set(data,\'{field}\',\'"value"\')')
    })
    it('$set multiple', function() {
      assert.equal(convertUpdate('data', { $set: { field: 'value', second: 2 } }), 'jsonb_set(jsonb_set(data,\'{second}\',\'2\'::jsonb),\'{field}\',\'"value"\')')
    })

    it('$unset', function() {
      assert.equal(convertUpdate('data', { $unset: { field: 'value' } }), 'data #- \'{field}\'')
    })
    it('$unset deep', function() {
      assert.equal(convertUpdate('data', { $unset: { 'field.inner': 1 } }), 'data #- \'{field,inner}\'')
    })
    it('$unset multiple', function() {
      assert.equal(convertUpdate('data', { $unset: { field: 1, second: 1 } }), 'data #- \'{second}\' #- \'{field}\'')
    })

    it('$inc', function() {
      assert.equal(convertUpdate('data', { $inc: { count: 2 } }), 'jsonb_set(data,\'{count}\',to_jsonb(Cast(data->>\'count\' as numeric)+2))')
    })
    it('$mul', function() {
      assert.equal(convertUpdate('data', { $mul: { count: 2 } }), 'jsonb_set(data,\'{count}\',to_jsonb(Cast(data->>\'count\' as numeric)*2))')
    })


    it('$min', function() {
      assert.equal(convertUpdate('data', { $min: { count: 5 } }), 'jsonb_set(data,\'{count}\',to_jsonb(LEAST(Cast(data->>\'count\' as numeric),5)))')
    })
    it('$max', function() {
      assert.equal(convertUpdate('data', { $max: { count: 5 } }), 'jsonb_set(data,\'{count}\',to_jsonb(GREATEST(Cast(data->>\'count\' as numeric),5)))')
    })

    it('$rename', function() {
      assert.equal(convertUpdate('data', { $rename: { current: 'newN' } }), 'jsonb_set(data,\'{newN}\',data->\'current\') #- \'{current}\'')
    })
    it('$pull', function() {
      assert.equal(convertUpdate('data', { $pull: { cities: 'LA' } }), 'array_remove(ARRAY(SELECT value FROM jsonb_array_elements(data->\'cities\')),\'"LA"\')')
    })
    it('$push', function() {
      assert.equal(convertUpdate('data', { $push: { cities: 'LA' } }), 'jsonb_set(data,\'{cities}\',to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(data->\'cities\') WHERE value != \'"LA"\'),\'"LA"\')))')
    })
  })

  describe('combined operators', function() {
    assert.equal(convertUpdate('data', { $set: { active: true }, $inc: { purchases: 2 } }), 'jsonb_set(jsonb_set(data,\'{active}\',\'true\'::jsonb),\'{purchases}\',to_jsonb(Cast(data->>\'purchases\' as numeric)+2))')
  })
})
