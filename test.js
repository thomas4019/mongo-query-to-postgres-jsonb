const assert = require('assert');
var convert = require('./index')

console.log(convert('data', {name: 'thomas'}));
assert(convert('data', {name: 'thomas'}) == "(data->>'name'='thomas')")

console.log(convert('data', {$or: [{name: 'thomas'}, {name: 'hansen'}] }));

console.log(convert('data', {fullName: 'TH', $or: [{name: 'thomas'}, {name: 'hansen'}] }));
console.log(convert('data', {test: {cat: {name: "oscar"}} }));
console.log(convert('data', {'test.cat.name': "oscar"}));
console.log(convert('data', {'roles': ['Admin']}));