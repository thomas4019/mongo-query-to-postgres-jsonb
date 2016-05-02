var quote = function(data) {
	if (typeof data == 'string')
		return "'" + stringEscape(data) + "'";
	return "'"+JSON.stringify(data)+"'::jsonb"
}

var stringEscape = function(str) {
	return str.replace(/'/g, "''")
}

var pathToText = function(path, isString) {
	var text = stringEscape(path[0]);
	for (var i = 1; i < path.length; i++) {
		text += (i == path.length-1 && isString ? '->>' : '->');
		if (/\d+/.test(path[i]))
			text += path[i]; //don't wrap numbers in  quotes
		else 
			text += '\'' + stringEscape(path[i]) + '\'';
	}
	return text;
}

var ops = {
	$eq: '=',
	$gt: '>',
	$gte: '>=',
	$lt: '<',
	$lte: '<=',
	$ne: '!=',
}

var otherOps = {
	$in: true, $nin: true, $not: true, $or: true, $and: true, $elemMatch: true
}

var convert = function (path, query) {
	if (typeof query == 'object' && !Array.isArray(query)) {
		var specialKeys = Object.keys(query)
		if (path.length > 1) {
			specialKeys = specialKeys.filter(function(key) {
				return key in ops || key in otherOps;
			})
		}
		if (specialKeys.length > 0) {
			var conditions = specialKeys.map(function(key) {
				var value = query[key]

				if (key == '$not') {
					return '(NOT ' + convert(path, query[key]) + ')';
				} else if (key == '$or' || key == '$and') {
					if (query[key].length == 0) {
						return key == '$or' ? 'FALSE' : 'TRUE'
					} else {
						return '('+query[key].map(function(subquery) {return convert(path, subquery) })
							.join(key == '$or' ? ' OR ' : ' AND ')+')';
					}
				} else if (key == '$elemMatch') {
					return pathToText(path, false) + ' @> \'' + stringEscape(JSON.stringify(query[key])) + '\'::jsonb';
				} else if (key == '$in' || key == '$nin') {
					return pathToText(path, typeof query[key][0] == 'string') + (key == '$nin' ? ' NOT' : '') + ' IN (' + query[key].map(quote).join(', ') + ')';
				} else if (Object.keys(ops).indexOf(key) !== -1) {
					var text = pathToText(path, typeof query[key] == 'string')
					return text + ops[key] + quote(query[key])
				} else {
					return convert(path.concat(key.split('.')), query[key]);
				}

			}).join(' and ');
			if (specialKeys.length == 1)
				return conditions;
			else
				return '(' + conditions + ')'
		} else {
			if (path.length == 1) {
				return 'TRUE';
			}
			var text = pathToText(path, typeof query == 'string')
			return text + '=' + quote(query);
		}
	} else {
		var text = pathToText(path, typeof query == 'string')
		return text + '=' + quote(query);
	}
}

module.exports = function (fieldName, query) {
	return convert([fieldName], query);
};