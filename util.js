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
    if (/\d+/.test(path[i]))
      text += path[i] //don't wrap numbers in  quotes
    else
      text += '\'' + exports.stringEscape(path[i]) + '\''
  }
  return text
}

exports.convertDotNotation = function(path, pathDotNotation) {
  return exports.pathToText([path].concat(pathDotNotation.split('.')), true)
}

exports.toPostgresPath = function(path) {
  return '\'{' + path.join(',') + '}\''
}

exports.toNumeric = function(path) {
  return 'Cast(' + path + ' as numeric)'
}