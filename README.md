# Mongo-Postgres Query Converter
[MongoDB query documents](https://docs.mongodb.org/manual/tutorial/query-documents/) are quite powerful.
This brings that usefulness to PostgreSQL by letting you query in a similar way.
This tool converts a Mongo query to a PostgreSQL `where` clause for data stored in a jsonb field.
It also has additional converters for Mongo projections which are like `select` clauses and for `update` queries.

This tool is used by [pgmongo](https://github.com/thomas4019/pgmongo) which intends to provide a drop-in replacement for MongoDB.

## Installation

```sh
npm install mongo-query-to-postgres-jsonb
```

## Simple Usage

```js
var mToPsql = require('mongo-query-to-postgres-jsonb')
var query = { field: 'value' }
var sqlQuery = mToPsql('data', query)
```

## API

```js
var mToPsql = require('mongo-query-to-postgres-jsonb')
```

### mToPsql(sqlField, mongoQuery, [arrayFields])

#### sqlField

This is the name of your jsonb column in your postgres table which holds all the data.

#### mongoQuery

An object containing MongoDB [query operators](https://docs.mongodb.com/manual/reference/operator/query/).

#### arrayFields

This tool doesn't know which fields are arrays so you can optionally specify a list of dotted paths which should be treated as an array.

### mToPsql.convertSelect(sqlField, projectionQuery, [arrayFields])

#### projectionQuery

Object specifying which a subset of documents to return. Note: advanced [projection fields](https://docs.mongodb.com/manual/reference/operator/projection/) are not yet supported. 

### mToPsql.convertUpdate(sqlField, updateQuery, [upsert])

#### updateQuery

Object containing [MongoDB operations](https://docs.mongodb.com/manual/reference/operator/update/) to apply to the documents. 

#### upsert

Indicate that the query is being used for upserting. This will create a safer query that works if the original document doesn't already exist.

### mToPsql.convertSort(sqlField, sortQuery, [forceNumericSort])

#### sortQuery

Object containing [desired ordering](https://docs.mongodb.com/manual/reference/method/cursor.sort/#sort-asc-desc)

#### forceNumericSort

Cast strings to number when sorting. 

## Examples

| Languages  | MongoDB                       |  Postgres                                                                       |
|------------|-------------------------------|---------------------------------------------------------------------------------|
| Where      | { 'names.0': 'thomas' }       |  (data->'names'->>0 = 'thomas')                                                 |
| Where      | { 'address.city': 'provo' }   |  data @> { "address": '{ "city": "provo" }' }                                   |
| Where      | { $or: [ { qty: { $gt: 100 } }, { price: { $lt: 9.95 } } ] } |  ((data->'qty'>'100'::jsonb) OR (data->'price'<'9.95'::jsonb))   |
| Projection | { field: 1 }                  |  jsonb_build_object('field', data->'field', '_id', data->'_id')'                |
| Update     | { $set: { active: true } }    |  jsonb_set(data,'{active}','true'::jsonb)                                       |
| Update     | { $inc: { purchases: 2 } }    |  jsonb_set(data,'{purchases}',to_jsonb(Cast(data->>'purchases' as numeric)+2))  |
| Sort       | { age: -1,   'first.name': 1} |  data->'age' DESC, data->'first'->'name' ASC                                    |

## Advanced Select: Match a Field Without Specifying Array Index

* [Mongo Docs](https://docs.mongodb.org/manual/tutorial/query-documents/#match-a-field-without-specifying-array-index)

With MongoDB, you can search a document with a subarray of objects that you want to match when any one of the elements in the array matches.
This tool implements it in SQL using a subquery, so it will likely not be the efficient on large datasets.

To enable subfield matching, you can pass a third parameter which is either an array of dotted paths that will be assumed
to potentially be arrays or `true` if you want it to assume any field can be an array.

Example document:
```js
{
  "courses": [{
      "distance": "5K"
    }, {
      "distance": "10K"
    }]
]
```
Example queries to match:
```js
mongoToPostgres('data', { 'courses.distance': '5K' }, ['courses'])
mongoToPostgres('data', { 'courses.distance': '5K' }, true)
```

This then creates a PostgreSQL query like the following:
```
(data->'courses'->>'distance'='5K'
OR EXISTS (SELECT * FROM jsonb_array_elements(data->'courses')
           WHERE jsonb_typeof(data->'courses')='array' AND value->>'distance'='5K'))
```

Note: nested paths are not yet supported, so passing ['courses', 'courses.distance'] won't support checking both.
The first matching path is the one that will be used.
    
## Supported Features
* $eq, $gt, $gte, $lt, $lte, $ne
* $or, $not, [$in](https://docs.mongodb.org/manual/reference/operator/query/in/#use-the-in-operator-to-match-values-in-an-array), $nin
* $elemMatch
* [$regex](https://docs.mongodb.com/manual/reference/operator/query/regex/), [$type](https://docs.mongodb.org/manual/reference/operator/query/type/#op._S_type), [$size](https://docs.mongodb.org/manual/reference/operator/query/size/#op._S_size), [$exists](https://docs.mongodb.org/manual/reference/operator/query/exists/#op._S_exists), [$mod](https://docs.mongodb.com/manual/reference/operator/query/mod/), [$all](https://docs.mongodb.com/manual/reference/operator/query/all/)

## Todo
* Filtering
    * [$expr](https://docs.mongodb.com/manual/reference/operator/query/expr/)
    * [Bitwise Operators](https://docs.mongodb.com/manual/reference/operator/query-bitwise/)
* Update
    * [$pop](https://docs.mongodb.com/manual/reference/operator/update/pop/)
    * [$currentDate](https://docs.mongodb.com/manual/reference/operator/update/currentDate/)
    * [$setOnInsert](https://docs.mongodb.com/manual/reference/operator/update/setOnInsert/)

## Cannot Support
* [$where](https://docs.mongodb.com/manual/reference/operator/query/where/)

## See also
* [PostgreSQL json/jsonb functions and operators](http://www.postgresql.org/docs/9.4/static/functions-json.html)
* [PostgreSQL json documentation](http://www.postgresql.org/docs/9.4/static/datatype-json.html)
* [MongoDB query documention](https://docs.mongodb.org/manual/tutorial/query-documents/)
* [PostgreSQL Array Functions](https://www.postgresql.org/docs/9.3/static/functions-array.html)
* [JSON array to PostgreSQL Array](https://dba.stackexchange.com/questions/54283/how-to-turn-json-array-into-postgres-array/54289#54289)
