# Mongo-Postgres Query Converter
[MongoDB query documents](https://docs.mongodb.org/manual/tutorial/query-documents/) are quite powerful.
This brings part of that usefulsness to PostgreSQL by letting you query in a similar way.
This tool converts a Mongo query to a PostgreSQL "where" clause for data stored in a jsonb field.
It also has additional converters for Mongo projections which are like "select" clauses and for update queries.

The goal of this is to eventually provide an adapter which lets Postgres serve as a drop in replacement for Mongo, but that is not there yet.
Currently the project has many of the underlying conversions that will be required to do this.
For that project, see [pgmongo](https://github.com/thomas4019/pgmongo).

### Select Query Example 1
```javascript
{ 'address.city': 'provo',
  name: 'Thomas',
  age: { '$gte': '30' } }
```
becomes the following Postgres query
```sql
(data->'address'->>'city'='provo') and (data->>'name'='Thomas') and (data->>'age'>='30')
```

### Select Query Example 2
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

### Projection Example

```javascript
mongoToPostgres.convertSelect('data', { field: 1 })
```
becomes the following Postgres query
```sql
jsonb_build_object('field', data->'field', '_id', data->'_id')'
```

### Update Example


```javascript
mongoToPostgres.convertUpdate('data', {
  $set: { active: true },
  $inc: { purchases: 2 }
})
```
becomes the following Postgres query
```sql
jsonb_set(jsonb_set(data,'{active}','true'::jsonb),'{purchases}',to_jsonb(Cast(data->>'purchases' as numeric)+2))
```

### Sort Example

```javascript
mongoToPostgres.convertSort('data', {
  age: -1,
  'first.name': 1
})
```
becomes the following Postgres query
```sql
data->'age' DESC, data->'first'->'name' ASC
```

## Select: Match a Field Without Specifying Array Index

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
* Filtering
    * [Match an array element](https://docs.mongodb.org/manual/tutorial/query-documents/#match-an-array-element)
    * [$all](https://docs.mongodb.com/manual/reference/operator/query/all/)
    * [$expr](https://docs.mongodb.com/manual/reference/operator/query/expr/)
    * [Bitwise Operators](https://docs.mongodb.com/manual/reference/operator/query-bitwise/)
* Update
    * [$pop](https://docs.mongodb.com/manual/reference/operator/update/pop/)
    * [$currentDate](https://docs.mongodb.com/manual/reference/operator/update/currentDate/)
    * [$setOnInsert](https://docs.mongodb.com/manual/reference/operator/update/setOnInsert/)
* Other
    * [Sort query conversions](https://docs.mongodb.com/manual/reference/method/cursor.sort/#cursor.sort)

## See also
* [PostgreSQL json/jsonb functions and operators](http://www.postgresql.org/docs/9.4/static/functions-json.html)
* [PostgreSQL json documentation](http://www.postgresql.org/docs/9.4/static/datatype-json.html)
* [MongoDB query documention](https://docs.mongodb.org/manual/tutorial/query-documents/)
* [PostgreSQL Array Functions](https://www.postgresql.org/docs/9.3/static/functions-array.html)
* [JSON array to PostgreSQL Array](https://dba.stackexchange.com/questions/54283/how-to-turn-json-array-into-postgres-array/54289#54289)