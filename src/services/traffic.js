const { gql, ApolloError } = require('apollo-server')
const moment = require('moment')
const ms = require('..')
const Traffic = ms.getModel('Traffic')
const typeDefs = gql`
  extend type Query {
    traffic: Traffic @auth
  }

  extend type Mutation {
    logTraffic(origin: String, device: String): Boolean
  }

  type Traffic {
    current: Int
    previous: Int
    device: [DeviceStats]
    source: [SourceStats]
    total: Int
  }

  type DeviceStats {
    _id: ID
    count: Int
  }

  type SourceStats {
    _id: ID
    count: Int
  }
`

const getSource = (origin = '') => {
  if (origin.indexOf('utm_source=IGShopping') > -1) return 'instagram'
  if (origin.indexOf('fbclid') > -1) return 'facebook'
  if (origin.indexOf('utm_source=whatsapp') > -1) return 'whatsapp'

  return
}

const resolvers = {
  Query: {
    traffic: async () => {
      const today = moment()
      const firstDayOfCurrentMonth = moment()
        .date(1)
        .hour(0)
        .minute(0)
        .second(0)

      const aMonthAgo = moment().month(today.month() - 1)
      const firstDayFromAMonthAgo = moment()
        .month(today.month() - 1)
        .date(1)
        .hour(0)
        .minute(0)
        .second(0)

      const thisPeriod = await Traffic.find({
        date: { $gte: firstDayOfCurrentMonth, $lte: today }
      }).exec()

      const previousPeriod = await Traffic.find({
        date: { $gte: firstDayFromAMonthAgo, $lte: aMonthAgo }
      }).exec()

      const source = await Traffic.aggregate([
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 }
          }
        }
      ])

      const device = await Traffic.aggregate([
        {
          $group: {
            _id: '$device',
            count: { $sum: 1 }
          }
        }
      ])

      return {
        current: thisPeriod.length,
        previous: previousPeriod.length,
        source,
        device,
        total: source.reduce((acc, cur) => acc + cur.count, 0)
      }
    }
  },
  Mutation: {
    logTraffic: (_, { origin, device }, { trace }) => {
      try {
        new Traffic({
          ip: trace.ip,
          source: getSource(origin),
          device
        }).save()
      } catch (e) {
        // do nothing
      }

      return true
    }
  }
}

module.exports = { typeDefs, resolvers }
