const assert = require('chai').assert
const { Client } = require('pg')
const convert = require('../index')
const convertSort = require('../sort')

const describePostgres = process.env.RUN_POSTGRES_E2E === 'true' ? describe : describe.skip

describePostgres('postgres e2e query semantics', function () {
  this.timeout(20000)

  let client

  function dbConfig() {
    return {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'test',
    }
  }

  async function runMongoQuery(query) {
    const where = convert('data', query)
    const sql = `SELECT id FROM mqtpj_docs WHERE ${where} ORDER BY id`
    const res = await client.query(sql)
    return res.rows.map((r) => r.id)
  }

  async function runMongoQueryWithSort(query, sort) {
    const where = convert('data', query)
    const order = convertSort('data', sort)
    const sql = `SELECT id FROM mqtpj_docs WHERE ${where} ORDER BY ${order}`
    const res = await client.query(sql)
    return res.rows.map((r) => r.id)
  }

  before(async function () {
    client = new Client(dbConfig())
    await client.connect()

    await client.query('DROP TABLE IF EXISTS mqtpj_docs')
    await client.query('CREATE TABLE mqtpj_docs (id TEXT PRIMARY KEY, data JSONB NOT NULL)')

    const docs = [
      { id: '1', data: { a: { b: 1 }, name: { first: 'alice' }, count: 5, type: 'food', price: 8.5, tags: ['alpha', 'beta'], arr: [1, 2, 3], var: 'text' } },
      { id: '2', data: {} },
      { id: '3', data: { a: {}, name: { first: 'bob' }, count: 2, type: 'snacks', price: 12, tags: ['beta'], arr: [1], var: 10 } },
      { id: '4', data: { a: null } },
      { id: '5', data: { name: {}, tags: ['gamma'] } },
      { id: '6', data: { count: 10, price: 5 } },
    ]
    for (const doc of docs) {
      await client.query('INSERT INTO mqtpj_docs(id, data) VALUES ($1, $2::jsonb)', [doc.id, JSON.stringify(doc.data)])
    }
  })

  after(async function () {
    if (client) {
      await client.query('DROP TABLE IF EXISTS mqtpj_docs')
      await client.end()
    }
  })

  describe('$exists', function () {
    it('nested true only matches rows with parent and key', async function () {
      assert.deepEqual(await runMongoQuery({ 'a.b': { $exists: true } }), ['1'])
    })

    it('nested false matches missing parent and missing child', async function () {
      assert.deepEqual(await runMongoQuery({ 'a.b': { $exists: false } }), ['2', '3', '4', '5', '6'])
    })

    it('deep nested false matches missing intermediate path', async function () {
      assert.deepEqual(await runMongoQuery({ 'name.first.middle': { $exists: false } }), ['1', '2', '3', '4', '5', '6'])
    })
  })

  describe('other operators smoke check', function () {
    it('$gt works against numeric JSON values', async function () {
      assert.deepEqual(await runMongoQuery({ count: { $gt: 6 } }), ['6'])
    })

    it('$in works for strings', async function () {
      assert.deepEqual(await runMongoQuery({ 'name.first': { $in: ['alice', 'bob'] } }), ['1', '3'])
    })

    it('$ne includes docs where field is absent', async function () {
      assert.deepEqual(await runMongoQuery({ count: { $ne: 5 } }), ['2', '3', '4', '5', '6'])
    })
  })

  describe('README-style query examples', function () {
    it('supports dot notation equality', async function () {
      assert.deepEqual(await runMongoQuery({ 'name.first': 'alice' }), ['1'])
    })

    it('supports logical $or', async function () {
      assert.deepEqual(await runMongoQuery({ $or: [{ count: { $gt: 100 } }, { price: { $lt: 9.95 } }] }), ['1', '6'])
    })

    it('supports array index lookup', async function () {
      assert.deepEqual(await runMongoQuery({ 'arr.0': 1 }), ['1', '3'])
    })

    it('supports $size for arrays', async function () {
      assert.deepEqual(await runMongoQuery({ arr: { $size: 3 } }), ['1'])
    })

    it('supports $type checks', async function () {
      assert.deepEqual(await runMongoQuery({ var: { $type: 'string' } }), ['1'])
    })

    it('supports case-insensitive regex with $options', async function () {
      assert.deepEqual(await runMongoQuery({ 'name.first': { $regex: '^AL', $options: 'i' } }), ['1'])
    })
  })

  describe('sort conversion integration', function () {
    it('sorts by nested field ascending', async function () {
      assert.deepEqual(await runMongoQueryWithSort({ 'name.first': { $exists: true } }, { 'name.first': 1 }), ['1', '3'])
    })
  })
})
