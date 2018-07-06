const _ = require('lodash')
const util = require('./util.js')

function convertOp(input, op, data, fieldName, upsert) {
  const pathText = Object.keys(data)[0]
  const value = data[pathText]
  delete data[pathText]
  if (Object.keys(data).length > 0) {
    input = convertOp(input, op, data, fieldName, upsert)
  }
  const path = pathText.split('.')
  const pgPath = util.toPostgresPath(path)
  const pgQueryPath = util.pathToText([fieldName].concat(path), false)
  const pgQueryPathStr = util.pathToText([fieldName].concat(path), true)
  const prevNumericVal = upsert ? '0' : util.toNumeric(pgQueryPathStr)
  switch (op) {
    case '$set':
      // Create the necessary top level keys since jsonb_set will not create them automatically.
      if (path.length > 1) {
        for (let i = 0; i < path.length - 1; i++) {
          const parentPath = util.toPostgresPath([path[i]])
          if (!input.includes(parentPath)) {
            const parentValue = upsert ? '\'{}\'::jsonb' : `COALESCE(${util.pathToText([fieldName].concat(path.slice(0, i + 1)))}, '{}'::jsonb)`
            input = 'jsonb_set(' + input + ',' + parentPath + ',' + parentValue + ')'
          }
        }
      }
      if (_.last(path) === '_id' && !upsert) {
        throw new Error('Mod on _id not allowed')
      }
      return 'jsonb_set(' + input + ',' + pgPath + ',' + util.quote2(value) + ')'
    case '$unset':
      return input + ' #- ' + pgPath
    case '$inc':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + prevNumericVal + '+' + value + '))'
    case '$mul':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + prevNumericVal + '*' + value + '))'
    case '$min':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(LEAST(' + prevNumericVal + ',' + value + ')))'
    case '$max':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(GREATEST(' + prevNumericVal + ',' + value + ')))'
    case '$rename':
      const pgNewPath = util.toPostgresPath(value.split('.'))
      return 'jsonb_set(' + input + ',' + pgNewPath + ',' + pgQueryPath + ') #- ' + pgPath
    case '$pull':
      return 'array_remove(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ')),' + util.quote2(value) + ')'
    case '$push':
      const v2 = util.quote2(value)
      if (upsert) {
        const newArray = 'jsonb_build_array(' + v2 + ')'
        return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray + ')'
      }
      const updatedArray2 = 'to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ')),' + v2 + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + updatedArray2 + ')'
    case '$addToSet':
      const v = util.quote2(value)
      if (upsert) {
        const newArray = 'jsonb_build_array(' + v + ')'
        return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray + ')'
      }
      const updatedArray = 'to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ') WHERE value != ' + v + '),' + v + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + updatedArray + ')'
  }
}

var convert = function (fieldName, update, upsert) {
  var specialCount = util.countUpdateSpecialKeys(update)
  if (specialCount === 0) {
    return '\'' + JSON.stringify(update) + '\'::jsonb'
  }
  var output = upsert ? '\'{}\'::jsonb' : fieldName
  let keys = Object.keys(update)
  // $set needs to happen first
  if (keys.includes('$set')) {
    keys = ['$set'].concat(_.pull(keys, '$set'))
  }
  keys.forEach(function(key) {
    if (!util.updateSpecialKeys.includes(key)) {
      throw new Error('The <update> document must contain only update operator expressions.')
    }
    output = convertOp(output, key, _.cloneDeep(update[key]), fieldName, upsert)
  })
  return output
}

module.exports = convert
