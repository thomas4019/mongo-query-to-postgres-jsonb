exports.updateSpecialKeys = ['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$push', '$pull', '$pullAll', '$addToSet']

exports.countUpdateSpecialKeys = function(doc) {
  return Object.keys(doc).filter(function(n) {
    return exports.updateSpecialKeys.includes(n)
  }).length
}

exports.quote = function(data) {
  if (typeof data == 'string')
    return '\'' + exports.stringEscape(data) + '\''
  return '\''+JSON.stringify(data)+'\'::jsonb'
}

exports.quote2 = function(data) {
  if (typeof data == 'string')
    return '\'"' + exports.stringEscape(data) + '"\''
  return '\''+JSON.stringify(data)+'\'::jsonb'
}

exports.stringEscape = function(str) {
  return str.replace(/'/g, '\'\'')
}

exports.pathToText = function(path, isString) {
  var text = exports.stringEscape(path[0])
  if (isString && path.length === 1) {
    return text + ' #>>\'{}\''
  }
  for (var i = 1; i < path.length; i++) {
    text += (i == path.length-1 && isString ? '->>' : '->')
    if (/^\d+$/.test(path[i]))
      text += path[i] //don't wrap numbers in  quotes
    else
      text += '\'' + exports.stringEscape(path[i]) + '\''
  }
  return text
}

exports.pathToObject = function(path) {
  if (path.length === 1) {
    return exports.quote2(path[0])
  }
  return '\'' + exports.pathToObjectHelper(path) + '\''
}

exports.pathToObjectHelper = function(path) {
  if (path.length === 1) {
    if (typeof path[0] == 'string') {
      return `"${path[0]}"`
    } else {
      return JSON.stringify(path[0])
    }
  }
  const [head, ...tail] = path
  return `{ "${head}": ${exports.pathToObjectHelper(tail)} }`
}

exports.convertDotNotation = function(path, pathDotNotation) {
  return exports.pathToText([path].concat(pathDotNotation.split('.')), true)
}

exports.toPostgresPath = function(path) {
  return '\'{' + path.join(',') + '}\''
}

exports.toNumeric = function(path) {
  return 'COALESCE(Cast(' + path + ' as numeric),0)'
}

const typeMapping = {
  1: 'number',
  2: 'string',
  3: 'object',
  4: 'array',
  8: 'boolean',
  10: 'null',
  16: 'number',
  18: 'number',
  19: 'number'
}

exports.getPostgresTypeName = function(type) {
  if (!['string', 'number'].includes(typeof type)) {
    throw { errmsg: 'argument to $type is not a number or a string', code: 14 }
  }
  return typeMapping[type] || type
}