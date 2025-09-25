exports.updateSpecialKeys = ['$currentDate', '$inc', '$min', '$max', '$mul', '$rename', '$set', '$setOnInsert', '$unset', '$push', '$pull', '$pullAll', '$addToSet']

exports.countUpdateSpecialKeys = function(doc) {
  return Object.keys(doc).filter(function(n) {
    return exports.updateSpecialKeys.includes(n)
  }).length
}

exports.quote = function(data) {
  if (typeof data == 'string')
    return '\'' + exports.postgresEscape(data) + '\''
  return '\'' + exports.postgresEscape(data) + '\'::jsonb'
}

exports.quote2 = function(data) {
  if (typeof data == 'string')
    return '\'"' + exports.postgresEscape(data) + '"\''
  return '\'' + exports.postgresEscape(data) + '\'::jsonb'
}

// Universal PostgreSQL escaping function that handles any data type
exports.postgresEscape = function(data) {
  // Use JSON.stringify to handle all special characters (backslashes, newlines, unicode, etc.)
  const jsonString = JSON.stringify(data);
  
  // For strings, remove the surrounding quotes that JSON.stringify adds
  const processedString = typeof data === 'string' ? jsonString.slice(1, -1) : jsonString;
  
  // Escape single quotes for PostgreSQL
  return processedString.replace(/'/g, "''");
}


exports.pathToText = function(path, isString) {
  var text = exports.postgresEscape(path[0])
  if (isString && path.length === 1) {
    return text + ' #>>\'{}\''
  }
  for (var i = 1; i < path.length; i++) {
    text += (i == path.length-1 && isString ? '->>' : '->')
    if (/^\d+$/.test(path[i]))
      text += path[i] //don't wrap numbers in  quotes
    else
      text += '\'' + exports.postgresEscape(path[i]) + '\''
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
      // For strings, wrap in quotes for JSON
      const escaped = exports.postgresEscape(path[0])
      return `"${escaped}"`
    } else {
      // For non-strings (arrays, objects, numbers, etc.), use direct JSON representation
      return exports.postgresEscape(path[0])
    }
  }
  const [head, ...tail] = path
  // Use enhanced escaping for field names too
  const escapedHead = exports.postgresEscape(head)
  return `{ "${escapedHead}": ${exports.pathToObjectHelper(tail)} }`
}

exports.convertDotNotation = function(path, pathDotNotation) {
  return exports.pathToText([path].concat(pathDotNotation.split('.')), true)
}

exports.toPostgresPath = function(path) {
  // Use enhanced escaping for path components
  const escapedPath = path.map(component => {
    if (typeof component === 'string') {
      return exports.postgresEscape(component)
    }
    return component
  })
  return '\'{' + escapedPath.join(',') + '}\''
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

function isIntegerStrict(val) {
  return val != 'NaN' && parseInt(val).toString() == val
}

exports.getPathSortedArray = function(keys) {
  return keys.sort((a, b) => {
    if (a == b) {
      return 0
    }

    var aArr = a.split('.')
    var bArr = b.split('.')

    for (var i = 0; i < aArr.length; i++) {
      if (i >= bArr.length) {
        return -1
      }

      if (aArr[i] == bArr[i]) {
        continue
      }

      var aItem = isIntegerStrict(aArr[i]) ? parseInt(aArr[i]) : aArr[i]
      var bItem = isIntegerStrict(bArr[i]) ? parseInt(bArr[i]) : bArr[i]

      return aItem > bItem ? -1 : 1
    }

    return 1
  })
}