
var quote = function(data) {
	if (typeof data == 'string')
		return "'" + data + "'";
	return "'"+JSON.stringify(data)+"'"
}

var convertWrapper = function (prefix, query) {
	return convert([prefix], query);
}

var convert = function (prefix, query) {
	if (typeof query == 'object' && !Array.isArray(query)) {
		str = ''
		for (key in query) {
			if (str != '') {
				str += ' and ';
			}

			if (key == '$or') {
				str += '('+query[key].map(function(subquery) {return convert(prefix, subquery) })
					.join(' OR ')+')';
			} else {
				//key = key.replace(/\\./g, '->');
				if (typeof query[key] == 'object') {
					str += convert(prefix+'->'+ "'"+key+"'", query[key]);
				} else {
					str += '('+convert(prefix+'->>'+ "'"+key+"'", query[key])+')';
				}
			}
		}
		return str
	} else {
		if (Array.isArray(query)) {
			return 
		} else {
			return prefix + '=' + quote(query);
		}
	}
}

module.exports = convertWrapper;