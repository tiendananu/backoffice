const { gql } = require('apollo-server')
const ms = require('..')
const Config = ms.getModel('Config')
const { print } = require('graphql')

const typeDefs = gql`
  extend type Query {
    settings: Settings
  }

  extend type Mutation {
    updateSettings(settings: Settings): Settings
  }

  scalar Settings
`

const resolvers = {
  Query: {
    settings: () => Config.findOne({ _id: 'settings' }).exec()
  },
  Mutation: {
    updateSettings: async (_, { settings }) => {
      delete settings._id

      const oldSettings = await Config.findOneAndUpdate(
        { _id: 'settings' },
        settings,
        {
          upsert: true
        }
      ).exec()

      const REFRESH_SETTINGS = gql`
        mutation refreshSettings {
          refreshSettings
        }
      `

      const serviceNames = ms.config.get('services') || []
      const promises = []
      serviceNames.forEach((serviceName) =>
        promises.push(
          new Promise((resolve, reject) => {
            axios
              .post(`${ms.config.get('url', serviceName)}/graphql`, {
                operationName: 'refreshSettings',
                query: print(REFRESH_SETTINGS)
              })
              .then(resolve)
              .catch(reject)
          })
        )
      )

      promises.push(
        new Promise((resolve, reject) => {
          axios
            .post(`${ms.config.get('url', 'web')}/refreshSettings`)
            .then(resolve)
            .catch(reject)
        })
      )

      return Promise.all(promises)
        .then(() => settings)
        .catch((e) => oldSettings)
    }
  }
}

module.exports = { typeDefs, resolvers }
