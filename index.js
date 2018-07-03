var util = require('./util.js')

// These are the simple operators.
var ops = {
  $eq: '=',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $ne: '!=',
}

var otherOps = {
  $all: true, $in: true, $nin: true, $not: true, $or: true, $and: true, $elemMatch: true, $regex: true, $type: true, $size: true, $exists: true, $mod: true
}

function convertOp(path, op, value, parent, arrayPaths) {
  if (arrayPaths) {
    for (var arrPath of arrayPaths) {
      if (op.startsWith(arrPath)) {
        const subPath = op.split('.')
        const innerPath = subPath.length > 1 ? ['value', subPath.pop()] : ['value']
        const singleElementQuery = convertOp(path, op, value, parent, [])
        path = path.concat(subPath)
        const text = util.pathToText(path, false)
        const safeArray = "jsonb_typeof(data->'a')='array' AND";
        let arrayQuery = '';
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          if (value['$elemMatch']) {
            const sub = convert(innerPath, value['$elemMatch'], [], false)
            arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
          } else if (value['$in']) {
            const sub = convert(innerPath, value, [], true)
            arrayQuery = `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
          } else if (value['$all']) {
            const cleanedValue = value['$all'].filter((v) => (v !== null && typeof v !== 'undefined'))
            arrayQuery = '(' + cleanedValue.map(function (subquery) {
              const sub = convert(innerPath, subquery, [], false)
              return `EXISTS (SELECT * FROM jsonb_array_elements(${text}) WHERE ${safeArray} ${sub})`
            }).join(' AND ') + ')'
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
        if (!arrayQuery) {
          return singleElementQuery
        }
        return `(${singleElementQuery} OR ${arrayQuery})`
      }
    }
  }
  switch(op) {
    case '$not':
      return '(NOT ' + convert(path, value) + ')'
    case '$nor':
      var notted = value.map((e) => ({ $not: e }));
      return convertOp(path, '$and', notted, value, arrayPaths);
    case '$or':
    case '$and':
      if (!Array.isArray(value)) {
        throw new Error('$and or $or requires an array.')
      }
      if (value.length == 0) {
        throw new Error('$and/$or/$nor must be a nonempty array')
      } else {
        for (const v of value) {
          if (typeof v !== "object") {
            throw new Error('$or/$and/$nor entries need to be full objects')
          }
        }
        return '(' + value.map((subquery) => convert(path, subquery)).join(op === '$or' ? ' OR ' : ' AND ') + ')'
      }
    // TODO (make sure this handles multiple elements correctly)
    case '$elemMatch':
      return convert(path, value, arrayPaths)
      //return util.pathToText(path, false) + ' @> \'' + util.stringEscape(JSON.stringify(value)) + '\'::jsonb'
    case '$in':
    case '$nin':
      if (value.length === 1) {
        return convert(path, value[0], arrayPaths)
      }
      const cleanedValue = value.filter((v) => (v !== null && typeof v !== 'undefined'))
      let partial = util.pathToText(path, typeof value[0] == 'string') + (op == '$nin' ? ' NOT' : '') + ' IN (' + cleanedValue.map(util.quote).join(', ') + ')'
      if (value.length != cleanedValue.length) {
        return (op === '$in' ? '(' + partial + ' OR IS NULL)' : '(' + partial + ' AND IS NOT NULL)'  )
      }
      return partial
    case '$regex':
      var op = '~'
      var op2 = '';
      if (parent['$options'] && parent['$options'].includes('i')) {
        op += '*'
      }
      if (!parent['$options'] || !parent['$options'].includes('s')) {
        op2 += '(?p)'
      }
      return util.pathToText(path, true) + ' ' + op + ' \'' + op2 + util.stringEscape(value) + '\''
    case '$eq':
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne':
      var text = util.pathToText(path, typeof value == 'string')
      return text + ops[op] + util.quote(value)
    case '$type':
      var text = util.pathToText(path, false)
      return 'jsonb_typeof(' + text + ')=' + util.quote(value)
    case '$size':
      var text = util.pathToText(path, false)
      return 'jsonb_array_length(' + text + ')=' + value
    case '$exists':
      const key = path.pop();
      var text = util.pathToText(path, false)
      return text + ' ? ' + util.quote(key)
    case '$mod':
      var text = util.pathToText(path, true)
      if (typeof value[0] != 'number' || typeof value[1] != 'number') {
        throw new Error('$mod requires numeric inputs')
      }
      return 'cast(' + text + ' AS numeric) % ' + value[0] + '=' + value[1];
    default:
      return convert(path.concat(op.split('.')), value)
  }
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
    var text = util.pathToText(path, typeof query == 'string')
    return text + '=' + util.quote(query)
  }
  if (query === null) {
    var text = util.pathToText(path, false)
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
    var specialKeys = Object.keys(query).filter(function (key) {
      return (path.length === 1 && !forceExact) || key in ops || key in otherOps
    })
    switch (specialKeys.length) {
      case 0:
        var text = util.pathToText(path, typeof query == 'string')
        return text + '=' + util.quote(query)
      case 1:
        const key = specialKeys[0];
        return convertOp(path, key, query[key], query, arrayPaths);
      default:
        return '(' + specialKeys.map(function (key) {
          return convertOp(path, key, query[key], query, arrayPaths);
        }).join(' and ') + ')'
    }
  }
}

module.exports = function (fieldName, query, arrays) {
  return convert([fieldName], query, arrays || [])
}
module.exports.convertDotNotation = util.convertDotNotation
module.exports.pathToText = util.pathToText
module.exports.convertSelect = require('./select');
module.exports.convertUpdate = require('./update');
module.exports.convertSort = require('./sort');