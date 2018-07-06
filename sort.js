var util = require('./util.js')

var convertField = function (fieldName, field, orderingType, forceNumericSort) {
  const dir = (orderingType === 1 ? 'ASC NULLS FIRST' : 'DESC NULLS LAST')
  const value = util.pathToText([fieldName].concat(field.split('.')), forceNumericSort)
  if (forceNumericSort) {
    return `cast(${value} as double precision) ${dir}`
  }
  return `${value} ${dir}`
}

var convert = function (fieldName, sortParams, forceNumericSort) {
  const orderings = Object.keys(sortParams).map(function(key) {
    return convertField(fieldName, key, sortParams[key], forceNumericSort || false)
  })
  return orderings.join(', ')
}

module.exports = convert
