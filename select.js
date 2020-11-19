var util = require('./util.js')

// TODO (ensure multi-level inside array projections work)
function convertRecur(fieldName, input, arrayFields, prefix, prefixStrip) {
  if (typeof input === 'string') {
    return util.pathToText([fieldName].concat(input.replace(new RegExp('^' + prefixStrip), '').split('.')), false)
  } else {
    var entries = []
    for (var key in input) {
      entries.push('\'' + key + '\'')
      if (!arrayFields[key]) {
        entries.push(convertRecur(fieldName, input[key], arrayFields[key] || {}, prefix + key + '.' , prefixStrip))
      } else {
        const obj = convertRecur('value', input[key], arrayFields[key] || {}, prefix + key + '.', prefix + key + '.')
        entries.push('(SELECT jsonb_agg(r) FROM (SELECT ' + obj + ' as r '  +
          'FROM jsonb_array_elements(data->\'arr\') as value) AS obj)')
      }
    }
    return 'jsonb_build_object(' + entries.join(', ') + ')'
  }
}

function convertToShellDoc(projection, prefix = '') {
  var shellDoc = {}
  var removals = []
  Object.keys(projection).forEach(function(field) {
    var path = field.split('.')
    if (projection[field] === 1) {
      var current = shellDoc
      for (var i = 0; i < path.length; i++) {
        var key = path[i]
        if (i !== path.length - 1) {
          current[key] = current[key] || {}
          current = current[key]
        } else {
          current[key] = prefix + field
        }
      }
    } else if (projection[field] === 0) {
      if (field !== '_id') {
        removals.push('#- ' + util.toPostgresPath(path))
      }
    } else if (typeof projection[field] === 'object' && !Array.isArray(projection[field])) {
      const { shellDoc: subShellDoc, removals: subRemovals } =
          convertToShellDoc(projection[field], prefix + field +  '.')
      shellDoc[field] = subShellDoc
      removals = removals.concat(subRemovals)
    } else {
      console.error(`unexpected projection value ${projection[field]} for ${field}`)
    }
  })
  return { shellDoc, removals }
}

var convert = function (fieldName, projection, arrayFields) {
  // Empty projection returns full document
  if (!projection) {
    return fieldName
  }
  //var output = '';
  let { shellDoc, removals } = convertToShellDoc(projection)

  //output += util.convertDotNotation(fieldName, field)
  //output +=
  if (Object.keys(shellDoc).length > 0 && typeof projection['_id'] === 'undefined') {
    shellDoc['_id'] = '_id'
  }
  else if (projection['_id'] === 0) {
    delete shellDoc['_id']
  }
  if (removals.length > 0 && Object.keys(shellDoc).length > 0) {
    throw new Error('Projection cannot have a mix of inclusion and exclusion.')
  }

  var out = Object.keys(shellDoc).length > 0 ? convertRecur(fieldName, shellDoc, arrayFields || {}, '', '') : fieldName
  if (removals.length) {
    out += ' ' + removals.join(' ')
  }
  if (out === fieldName){
    return out
  }
  return out + ' as ' + fieldName
}

module.exports = convert
