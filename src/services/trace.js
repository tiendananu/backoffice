const { gql } = require('apollo-server')
const ms = require('..')
const Trace = ms.getModel('Trace')
const PAGE_SIZE = 12

const typeDefs = gql`
  extend type Query {
    traces(
      _id: ID
      operation: String
      dateFrom: String
      dateTo: String
      environment: Environment
      module: String
      type: LogType
      message: String
      user: String
      ip: String
      offset: Int
      size: Int
      sort: String
    ): [Trace] @auth(requires: ADMIN)
    traceFacets: TraceFacets @auth(requires: ADMIN)
  }

  type Trace {
    _id: ID
    operation: String
    ip: String
    user: String
    module: String
    date: Date
    environment: String
    logs: [Log]
  }

  type Log {
    _id: ID
    timestamp: Date
    message: String
    data: LogData
    type: LogType
  }

  scalar LogData

  enum Environment {
    development
    staging
    production
  }

  enum LogType {
    log
    info
    error
    warning
  }

  type TraceFacets {
    operations: [Facet]
    modules: [Facet]
    dates: DateFacet
  }

  type Facet {
    _id: String
    count: Int
  }
  type DateFacet {
    min: String
    max: String
  }
`

const resolvers = {
  Query: {
    traceFacets: async () => {
      const operations = await Trace.aggregate([
        {
          $group: {
            _id: '$operation',
            count: { $sum: 1 }
          }
        }
      ])

      const modules = await Trace.aggregate([
        {
          $group: {
            _id: '$module',
            count: { $sum: 1 }
          }
        }
      ])

      const dates = await Trace.aggregate([
        {
          $group: {
            _id: 'date',
            max: { $max: '$date' },
            min: { $min: '$date' }
          }
        }
      ])

      return { operations, modules, dates: dates[0] }
    },
    traces: (
      _,
      {
        offset = 0,
        size = PAGE_SIZE,
        sort = '-date',
        type,
        user,
        ip,
        message,
        dateFrom,
        dateTo,
        ...trace
      }
    ) => {
      if (user) trace.user = new RegExp(user)
      if (ip) trace.ip = new RegExp(ip)

      if (type) trace['logs.type'] = new RegExp(type)
      if (message) trace['logs.message'] = new RegExp(message)

      if (dateFrom || dateTo) trace.date = {}

      if (dateFrom) trace.date.$gte = `${dateFrom}:00+0000`
      if (dateTo) trace.date.$lte = `${dateTo}:00+0000`

      return Trace.find(trace).sort(sort).skip(offset).limit(size).exec()
    }
  }
}

module.exports = { typeDefs, resolvers }
