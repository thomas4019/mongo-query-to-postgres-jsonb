var util = require('./util.js')

var convert = function (fieldName, projection) {
  // Empty projection returns full document
  if (!projection) {
    return fieldName
  }
  //var output = '';
  var shellDoc = {}
  var removals = [];
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
          current[key] = field
        }
      }
    } else if (projection[field] === 0) {
      if (field !== '_id') {
        removals.push('#- ' + util.toPostgresPath(path))
      }
    } else {
      console.error(`unexpected projection value ${projection[field]} for ${field}`)
    }
    //output += util.convertDotNotation(fieldName, field)
    //output +=
  })
  if (Object.keys(shellDoc).length > 0 && typeof projection['_id'] === 'undefined') {
    shellDoc['_id'] = '_id'
  }
  else if (projection['_id'] === 0) {
    delete shellDoc['_id']
  }
  if (removals.length > 0 && Object.keys(shellDoc).length > 0) {
    throw new Error('Projection cannot have a mix of inclusion and exclusion.')
  }
  function convertRecur(input) {
    if (typeof input === 'string') {
      return util.pathToText([fieldName].concat(input.split('.')), false)
    } else {
      var entries = []
      for (var key in input) {
        entries.push('\'' + key + '\'')
        entries.push(convertRecur(input[key]))
      }
      return 'jsonb_build_object(' + entries.join(', ') + ')'
    }
  }
  var out = Object.keys(shellDoc).length > 0 ? convertRecur(shellDoc) : fieldName;
  if (removals.length) {
    out += ' ' + removals.join(' ')
  }
  if (out === fieldName){
    return fieldName
  }
  return out + ' as ' + fieldName
}

module.exports = convert
