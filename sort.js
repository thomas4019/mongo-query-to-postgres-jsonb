var util = require('./util.js')

var convertField = function (fieldName, field, orderingType) {
  const dir = (orderingType === 1 ? 'ASC NULLS FIRST' : 'DESC NULLS LAST')
  const value = util.pathToText([fieldName].concat(field.split('.')), false)
  return value + ' ' + dir;
}

var convert = function (fieldName, sortParams) {
  const orderings = Object.keys(sortParams).map(function(key) {
    return convertField(fieldName, key, sortParams[key])
  });
  return orderings.join(', ');
}

module.exports = convert
