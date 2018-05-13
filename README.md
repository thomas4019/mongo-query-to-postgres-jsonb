# Mongo-Postgres Query Converter
[MongoDB query documents](https://docs.mongodb.org/manual/tutorial/query-documents/) are quite powerful.
This brings part of that usefulsness to PostgreSQL by letting you query in a similar way.
This tool converts a Mongo query to a PostgreSQL "where" clause for data stored in a jsonb field.

### Query Example 1
```javascript
{ 'address.city': 'provo',
  name: 'Thomas',
  age: { '$gte': '30' } }
```
becomes the following Postgres query
```sql
(data->'address'->>'city'='provo') and (data->>'name'='Thomas') and (data->>'age'>='30')
```

### Query Example 2
```javascript
{
     $or: [ { qty: { $gt: 100 } }, { price: { $lt: 9.95 } } ]
}
```
becomes the following Postgres query
```sql
((data->'qty'>'100'::jsonb) OR (data->'price'<'9.95'::jsonb))
```

## Getting Started

```bash
npm install mongo-query-to-postgres-jsonb
```

```javascript
var mongoToPostgres = require('mongo-query-to-postgres-jsonb')
var query = { field: 'value' }
var sqlQuery = mongoToPostgres('data', query)
console.log(sqlQuery)
```

The first parameter, "data", is the name of your jsonb column in your postgres table.
The second parameter is the Mongo style query.
There is an optional third parameter explained in the next section.

## Match a Field Without Specifying Array Index

* [Mongo Docs](https://docs.mongodb.org/manual/tutorial/query-documents/#match-a-field-without-specifying-array-index)

You can have a document with an array of objects that you want to match when any one of the elements in the array matches.
This is implemented in SQL using a subquery so it may not be the most efficient.

Example document.
```javascript
{
  "courses": [{
    "distance": "5K"
  }, {
    "distance": "10K"
  }]
}
```
Unlike Mongo, this tool doesn't know which fields are arrays and requires you to supply a list optionally as a third parameter.
Example query to match when there is a course with a distance of "5K".
```javascript
mongoToPostgres('data', { 'courses.distance': '5K' }, ['courses'])
```
    
## Supported Features
* $eq, $gt, $gte, $lt, $lte, $ne
* $or, $not, $nin
* [$in](https://docs.mongodb.org/manual/reference/operator/query/in/#use-the-in-operator-to-match-values-in-an-array), $nin
* $elemMatch
* [$regex](https://docs.mongodb.com/manual/reference/operator/query/regex/)
* [$type](https://docs.mongodb.org/manual/reference/operator/query/type/#op._S_type)
* [$size](https://docs.mongodb.org/manual/reference/operator/query/size/#op._S_size)
* [$exists](https://docs.mongodb.org/manual/reference/operator/query/exists/#op._S_exists)
* [$mod](https://docs.mongodb.com/manual/reference/operator/query/mod/)

## Todo
* [Match an array element](https://docs.mongodb.org/manual/tutorial/query-documents/#match-an-array-element)
* [$all](https://docs.mongodb.com/manual/reference/operator/query/all/)
* [$expr](https://docs.mongodb.com/manual/reference/operator/query/expr/)
* [Bitwise Operators](https://docs.mongodb.com/manual/reference/operator/query-bitwise/)

## See also
* [PostgreSQL json/jsonb functions and operators](http://www.postgresql.org/docs/9.4/static/functions-json.html)
* [PostgreSQL json documentation](http://www.postgresql.org/docs/9.4/static/datatype-json.html)
* [MongoDB query documention](https://docs.mongodb.org/manual/tutorial/query-documents/)