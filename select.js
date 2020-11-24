var util = require('./util.js')

function convertRecur(fieldName, input, arrayFields, prefix, prefixStrip) {
  if (typeof input === 'string') {
    return util.pathToText([fieldName].concat(input.replace(new RegExp('^' + prefixStrip), '').split('.')), false)
  } else {
    var entries = []
    for (var key in input) {
      entries.push('\'' + key + '\'')
      const nestedArrayField = arrayFields.includes(prefix + key) && typeof input[key] === 'object'
      if (!nestedArrayField) {
        entries.push(convertRecur(fieldName, input[key], arrayFields, prefix + key + '.' , prefixStrip))
      } else {
        const path = util.pathToText([fieldName].concat((prefix + key).replace(new RegExp('^' + prefixStrip), '').split('.')), false)
        const obj = convertRecur('v', input[key], arrayFields, prefix + key + '.', prefix + key + '.')
        entries.push(`(SELECT jsonb_agg(r) FROM (SELECT ${obj} as r FROM jsonb_array_elements(${path}) as v) AS obj)`)
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

const convert = function (fieldName, projection, arrayFields) {
  arrayFields = arrayFields || []
  // Empty projection returns full document
  if (!projection) {
    return fieldName
  }
  let { shellDoc, removals } = convertToShellDoc(projection)

  if (Object.keys(shellDoc).length > 0 && typeof projection['_id'] === 'undefined') {
    shellDoc['_id'] = '_id'
  }
  else if (projection['_id'] === 0) {
    delete shellDoc['_id']
  }
  if (removals.length > 0 && Object.keys(shellDoc).length > 0) {
    throw new Error('Projection cannot have a mix of inclusion and exclusion.')
  }

  let out = Object.keys(shellDoc).length > 0 ? convertRecur(fieldName, shellDoc, arrayFields, '', '') : fieldName
  if (removals.length) {
    out += ' ' + removals.join(' ')
  }
  if (out === fieldName){
    return out
  }
  return out + ' as ' + fieldName
}

module.exports = convert
