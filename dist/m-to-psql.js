(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const util = require('./util.js')

// These are the simple operators.
// Note that "is distinct from" needs to be used to ensure nulls are returned as expected, see https://modern-sql.com/feature/is-distinct-from
const OPS = {
  $eq: '=',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $ne: ' IS DISTINCT FROM ',
}

const OTHER_OPS = {
  $all: true, $in: true, $nin: true, $not: true, $or: true, $and: true, $elemMatch: true, $regex: true, $type: true, $size: true, $exists: true, $mod: true, $text: true
}

function getMatchingArrayPath(op, arrayPaths) {
  if (arrayPaths === true) {
    // always assume array path if true is passed
    return true
  }
  if (!arrayPaths || !Array.isArray(arrayPaths)) {
    return false
  }
  return arrayPaths.find(path => op.startsWith(path))
}

/**
 * @param path array path current key
 * @param op current key, might be a dotted path
 * @param value
 * @param parent
 * @param arrayPathStr
 * @returns {string|string|*}
 */
function createElementOrArrayQuery(path, op, value, parent, arrayPathStr) {
  const arrayPath = arrayPathStr.split('.')
  const deeperPath = op.split('.').slice(arrayPath.length)
  const innerPath = ['value', ...deeperPath]
  const pathToMaybeArray = path.concat(arrayPath)

  // TODO: nested array paths are not yet supported.
  const singleElementQuery = convertOp(path, op, value, parent, [])

  const text = util.pathToText(pathToMaybeArray, false)
  const safeArray = `jsonb_typeof(${text})='array' AND`

  let arrayQuery = ''
  const specialKeys = getSpecialKeys(path, value, true)
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    if (typeof value['$size'] !== 'undefined') {
      // size does not support array element based matching
    } else if (value['$elemMatch']) {
      const sub = convert(innerPath, value['$elemMatch'], [], false)
      arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
      return arrayQuery
    } else if (value['$in']) {
      const sub = convert(innerPath, value, [], true)
      arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
    } else if (value['$all']) {
      const cleanedValue = value['$all'].filter((v) => (v !== null && typeof v !== 'undefined'))
      arrayQuery = '(' + cleanedValue.map(function (subquery) {
        const sub = convert(innerPath, subquery, [], false)
        return `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
      }).join(' AND ') + ')'
    } else if (specialKeys.length === 0) {
      const sub = convert(innerPath, value, [], true)
      arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
    } else {
      const params = value
      arrayQuery = '(' + Object.keys(params).map(function (subKey) {
        const sub = convert(innerPath, { [subKey]: params[subKey] }, [], true)
        return `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
      }).join(' AND ') + ')'
    }
  } else {
    const sub = convert(innerPath, value, [], true)
    arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
  }
  if (!arrayQuery || arrayQuery === '()') {
    return singleElementQuery
  }
  return `(${singleElementQuery} OR ${arrayQuery})`
}

/**
 * @param path {string} a dotted path
 * @param op {string} sub path, especially the current operation to convert, e.g. $in
 * @param value {mixed}
 * @param parent {mixed} parent[path] = value
 * @param arrayPaths {Array} List of dotted paths that possibly need to be handled as arrays.
 */
function convertOp(path, op, value, parent, arrayPaths) {
  const arrayPath = getMatchingArrayPath(op, arrayPaths)
  // It seems like direct matches shouldn't be array fields, but 2D arrays are possible in MongoDB
  // I will need to do more testing to see if we should handle this case differently.
  // const arrayDirectMatch = !isSpecialOp(op) && Array.isArray(value)
  if (arrayPath) {
    return createElementOrArrayQuery(path, op, value, parent, arrayPath)
  }
  switch(op) {
    case '$not':
      return '(NOT ' + convert(path, value) + ')'
    case '$nor': {
      for (const v of value) {
        if (typeof v !== 'object') {
          throw new Error('$or/$and/$nor entries need to be full objects')
        }
      }
      const notted = value.map((e) => ({ $not: e }))
      return convertOp(path, '$and', notted, value, arrayPaths)
    }
    case '$or':
    case '$and':
      if (!Array.isArray(value)) {
        throw new Error('$and or $or requires an array.')
      }
      if (value.length == 0) {
        throw new Error('$and/$or/$nor must be a nonempty array')
      } else {
        for (const v of value) {
          if (typeof v !== 'object') {
            throw new Error('$or/$and/$nor entries need to be full objects')
          }
        }
        return '(' + value.map((subquery) => convert(path, subquery, arrayPaths)).join(op === '$or' ? ' OR ' : ' AND ') + ')'
      }
    // TODO (make sure this handles multiple elements correctly)
    case '$elemMatch':
      return convert(path, value, arrayPaths)
      //return util.pathToText(path, false) + ' @> \'' + util.stringEscape(JSON.stringify(value)) + '\'::jsonb'
    case '$in':
    case '$nin': {
      if (value.length === 0) {
        return 'FALSE'
      }
      if (value.length === 1) {
        return convert(path, value[0], arrayPaths)
      }
      const cleanedValue = value.filter((v) => (v !== null && typeof v !== 'undefined'))
      let partial = util.pathToText(path, typeof value[0] == 'string') + (op == '$nin' ? ' NOT' : '') + ' IN (' + cleanedValue.map(util.quote).join(', ') + ')'
      if (value.length != cleanedValue.length) {
        return (op === '$in' ? '(' + partial + ' OR IS NULL)' : '(' + partial + ' AND IS NOT NULL)'  )
      }
      return partial
    }
    case '$text': {
      const newOp = '~' + (!value['$caseSensitive'] ? '*' : '')
      return util.pathToText(path, true) + ' ' + newOp + ' \'' + util.stringEscape(value['$search']) + '\''
    }
    case '$regex':  {
      var regexOp = '~'
      var op2 = ''
      if (parent['$options'] && parent['$options'].includes('i')) {
        regexOp += '*'
      }
      if (!parent['$options'] || !parent['$options'].includes('s')) {
        // partial newline-sensitive matching
        op2 += '(?p)'
      }
      if (value instanceof RegExp) {
        value = value.source
      }
      return util.pathToText(path, true) + ' ' + regexOp + ' \'' + op2 + util.stringEscape(value) + '\''
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne':
    case '$eq':  {
      const isSimpleComparision = (op === '$eq' || op === '$ne')
      const pathContainsArrayAccess = path.some((key) => /^\d+$/.test(key))
      if (isSimpleComparision && !pathContainsArrayAccess) {
        // create containment query since these can use GIN indexes
        // See docs here, https://www.postgresql.org/docs/9.4/datatype-json.html#JSON-INDEXING
        const [head, ...tail] = path
        return `${op=='$ne' ? 'NOT ' : ''}${head} @> ` + util.pathToObject([...tail, value])
      } else {
        var text = util.pathToText(path, typeof value == 'string')
        return text + OPS[op] + util.quote(value)
      }
    }
    case '$type': {
      const text = util.pathToText(path, false)
      const type = util.getPostgresTypeName(value)
      return 'jsonb_typeof(' + text + ')=' + util.quote(type)
    }
    case '$size': {
      if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
        throw new Error('$size only supports positive integer')
      }
      const text = util.pathToText(path, false)
      return 'jsonb_array_length(' + text + ')=' + value
    }
    case '$exists': {
      if (path.length > 1) {
        const key = path.pop()
        const text = util.pathToText(path, false)
        return (value ? '' : ' NOT ') + text + ' ? ' + util.quote(key)
      } else {
        const text = util.pathToText(path, false)
        return text + ' IS ' + (value ? 'NOT ' : '') + 'NULL'
      }
    }
    case '$mod': {
      const text = util.pathToText(path, true)
      if (typeof value[0] != 'number' || typeof value[1] != 'number') {
        throw new Error('$mod requires numeric inputs')
      }
      return 'cast(' + text + ' AS numeric) % ' + value[0] + '=' + value[1]
    }
    default:
      // this is likely a top level field, recurse
      return convert(path.concat(op.split('.')), value)
  }
}

function isSpecialOp(op) {
  return op in OPS || op in OTHER_OPS
}

// top level keys are always special, since you never exact match the whole object
function getSpecialKeys(path, query, forceExact) {
  return Object.keys(query).filter(function (key) {
    return (path.length === 1 && !forceExact) || isSpecialOp(key)
  })
}

/**
 * Convert a filter expression to the corresponding PostgreSQL text.
 * @param path {Array} The current path
 * @param query {Mixed} Any value
 * @param arrayPaths {Array} List of dotted paths that possibly need to be handled as arrays.
 * @param forceExact {Boolean} When true, an exact match will be required.
 * @returns The corresponding PSQL expression
 */
var convert = function (path, query, arrayPaths, forceExact=false) {
  if (typeof query === 'string' || typeof query === 'boolean' || typeof query == 'number' || Array.isArray(query)) {
    return convertOp(path, '$eq', query, {}, arrayPaths)
  }
  if (query === null) {
    const text = util.pathToText(path, false)
    return '(' + text + ' IS NULL OR ' + text + ' = \'null\'::jsonb)'
  }
  if (query instanceof RegExp) {
    var op = query.ignoreCase ? '~*' : '~'
    return util.pathToText(path, true) + ' ' + op + ' \'' + util.stringEscape(query.source) + '\''
  }
  if (typeof query === 'object') {
    // Check for an empty object
    if (Object.keys(query).length === 0) {
      return 'TRUE'
    }
    const specialKeys = getSpecialKeys(path, query, forceExact)
    switch (specialKeys.length) {
      case 0: {
        const text = util.pathToText(path, typeof query == 'string')
        return text + '=' + util.quote(query)
      }
      case 1: {
        const key = specialKeys[0]
        return convertOp(path, key, query[key], query, arrayPaths)
      }
      default:
        return '(' + specialKeys.map(function (key) {
          return convertOp(path, key, query[key], query, arrayPaths)
        }).join(' and ') + ')'
    }
  }
}

module.exports = function (fieldName, query, arrays) {
  return convert([fieldName], query, arrays || [])
}
module.exports.convertDotNotation = util.convertDotNotation
module.exports.pathToText = util.pathToText
module.exports.countUpdateSpecialKeys = util.countUpdateSpecialKeys
module.exports.convertSelect = require('./select')
module.exports.convertUpdate = require('./update')
module.exports.convertSort = require('./sort')

},{"./select":3,"./sort":4,"./update":5,"./util.js":6}],2:[function(require,module,exports){
(function (global){(function (){
global.window.mToPsql = require('./index.js')


}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./index.js":1}],3:[function(require,module,exports){
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

},{"./util.js":6}],4:[function(require,module,exports){
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

},{"./util.js":6}],5:[function(require,module,exports){
const util = require('./util.js')
const convertWhere = require('./index.js')

function convertOp(input, op, data, fieldName, upsert) {
  const pathText = Object.keys(data)[0]
  const value = data[pathText]
  delete data[pathText]
  if (Object.keys(data).length > 0) {
    input = convertOp(input, op, Object.assign({}, data), fieldName, upsert)
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
          const slice = path.slice(0, i + 1)
          const parentPath = util.toPostgresPath(slice)
          if (!input.includes(parentPath)) {
            const parentValue = upsert ? '\'{}\'::jsonb' : `COALESCE(${util.pathToText([fieldName].concat(slice))}, '{}'::jsonb)`
            input = 'jsonb_set(' + input + ',' + parentPath + ',' + parentValue + ')'
          }
        }
      }
      if (path[path.length - 1] === '_id' && !upsert) {
        throw new Error('Mod on _id not allowed')
      }
      return 'jsonb_set(' + input + ',' + pgPath + ',' + util.quote2(value) + ')'
    case '$unset':
      return input + ' #- ' + pgPath
    case '$inc':
      // TODO: Handle null value keys (MongoDB drops the operation with "Cannot apply $inc to a value of non-numeric type null")
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + prevNumericVal + '+' + value + '))'
    case '$mul':
      // TODO: Handle null value keys (MongoDB drops the operation with "Cannot apply $mul to a value of non-numeric type null")
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(' + prevNumericVal + '*' + value + '),TRUE)'
    case '$min':
      // TODO: $min between existing key with value null with anything will output null
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(LEAST(' + prevNumericVal + ',' + value + ')))'
    case '$max':
      // TODO: $max between existing key with value null with anything will output value
      return 'jsonb_set(' + input + ',' + pgPath + ',to_jsonb(GREATEST(' + prevNumericVal + ',' + value + ')))'
    case '$rename': {
      const pgNewPath = util.toPostgresPath(value.split('.'))
      return 'jsonb_set(' + input + ',' + pgNewPath + ',' + pgQueryPath + ') #- ' + pgPath
    }
    case '$pull': {
      const newArray = 'to_jsonb(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ') WHERE NOT ' + convertWhere('value', value, upsert) + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray + ')'
    }
    case '$pullAll': {
      const pullValues = '(' + value.map((v) => util.quote2(v)).join(',') + ')'
      const newArray2 = 'to_jsonb(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ') WHERE value NOT IN ' + pullValues + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray2 + ')'
    }
    case '$push': {
      const v2 = util.quote2(value)
      if (upsert) {
        const newArray = 'jsonb_build_array(' + v2 + ')'
        return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray + ')'
      }
      const updatedArray2 = 'to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ')),' + v2 + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + updatedArray2 + ')'
    }
    case '$addToSet': {
      const v = util.quote2(value)
      if (upsert) {
        const newArray = 'jsonb_build_array(' + v + ')'
        return 'jsonb_set(' + input + ',' + pgPath + ',' + newArray + ')'
      }
      const updatedArray = 'to_jsonb(array_append(ARRAY(SELECT value FROM jsonb_array_elements(' + pgQueryPath + ') WHERE value != ' + v + '),' + v + '))'
      return 'jsonb_set(' + input + ',' + pgPath + ',' + updatedArray + ')'
    }
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
    keys = ['$set'].concat(keys.filter((v) => v !== '$set'))
  }
  keys.forEach(function(key) {
    if (!util.updateSpecialKeys.includes(key)) {
      throw new Error('The <update> document must contain only update operator expressions.')
    }
    output = convertOp(output, key, Object.assign({}, update[key]), fieldName, upsert)
  })
  return output
}

module.exports = convert

},{"./index.js":1,"./util.js":6}],6:[function(require,module,exports){
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
},{}]},{},[2]);
