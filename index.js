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
      return convert(path.concat(op.split('.')), value)
  }
}

function getSpecialKeys(path, query, forceExact) {
  return Object.keys(query).filter(function (key) {
    return (path.length === 1 && !forceExact) || key in OPS || key in OTHER_OPS
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
