var util = require('./util.js')

const specialKeys = ['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$push', '$pull']

function convertOp(input, op, data, fieldName) {
  const pathText = Object.keys(data)[0];
  const value = data[pathText];
  delete data[pathText];
  if (Object.keys(data).length > 0) {
    input = convertOp(input, op, data, fieldName)
  }
  const path = pathText.split('.');
  const pgPath = util.toPostgresPath(path);
  const pgQueryPath = util.pathToText([fieldName].concat(path), false)
  const pgQueryPathStr = util.pathToText([fieldName].concat(path), true)
  switch (op) {
    case '$set':
      if (path.pop() === '_id') {
        throw new Error('Mod on _id not allowed')
      }
      return 'jsonb_set(' + input + ',' + pgPath + ',' + util.quote2(value) + ')'
      break;
    case '$unset':
      return input + ' #- ' + pgPath;
    case '$inc':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + util.toNumeric(pgQueryPathStr) + '+' + value + '))'
    case '$mul':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + util.toNumeric(pgQueryPathStr) + '*' + value + '))'
    case '$min':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(LEAST(' + util.toNumeric(pgQueryPathStr) + ',' + value + ')))'
    case '$max':
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(GREATEST(' + util.toNumeric(pgQueryPathStr) + ',' + value + ')))'
    case '$rename':
      const pgNewPath = util.toPostgresPath(value.split('.'))
      return 'jsonb_set(' + input + ',' + pgNewPath + ',' + pgQueryPath + ') #- ' + pgPath;
    case '$pull':
      return 'array_remove(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ')),' + util.quote2(value) + ')'
    case '$push':
      const v = util.quote2(value);
      const updatedArray = 'to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ') WHERE value != ' + v + '),' + v + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + updatedArray + ')'
  }
}

var convert = function (fieldName, update) {
  var specialCount = Object.keys(update).filter(function(n) {
    return specialKeys.includes(n)
  }).length;
  if (specialCount === 0) {
    return '\'' + JSON.stringify(update) + '\'::jsonb'
  }
  var output = fieldName
  Object.keys(update).forEach(function(key) {
    if (!specialKeys.includes(key)) {
      throw new Error('The <update> document must contain only update operator expressions.')
    }
    output = convertOp(output, key, update[key], fieldName)
  })
  return output
}

module.exports = convert
