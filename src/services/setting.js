const { gql } = require('apollo-server')
const ms = require('..')
const Config = ms.getModel('Config')
const { print } = require('graphql')
const axios = require('axios').default
const get = require('lodash/get')
const typeDefs = gql`
  extend type Query {
    settings: Settings
    translations: [Translation]
  }

  extend type Mutation {
    updateSettings(settings: Settings): Settings
    updateTranslation(
      key: ID!
      newKey: String
      values: [TranslationValue]
    ): Translation
    insertTranslation(key: ID!, values: [TranslationValue]): Translation
  }

  scalar Settings
  scalar Translation
  scalar TranslationValue
`

const resolvers = {
  Query: {
    settings: () => Config.findOne({ _id: 'settings' }).exec(),
    translations: () =>
      Config.findOne({ _id: 'translations' })
        .select('translations')
        .exec()
        .then(
          (translations) => get(translations.toObject(), 'translations') || []
        )
  },
  Mutation: {
    updateTranslation: (_, { key, newKey, values }) =>
      Config.findOneAndUpdate(
        { _id: 'translations', 'translations.key': key },
        {
          $set: {
            'translations.$.key': newKey || key,
            'translations.$.values': values
          }
        },
        {
          new: true
        }
      ).exec(),
    insertTranslation: (_, translation) =>
      Config.findOneAndUpdate(
        { _id: 'translations', 'translations.key': { $ne: translation.key } },
        {
          $push: { translations: translation }
        },
        {
          new: true
        }
      ).exec(),
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
          })
        )
      )

      const hooks = ms.config.get('vercel.hooks') || []
      for (let hook of hooks)
        promises.push(
          new Promise((resolve, reject) => {
            axios.get(hook).then(resolve)
          })
        )

      return Promise.all(promises)
        .then(() => settings)
        .catch((e) => oldSettings)
    }
  }
}

module.exports = { typeDefs, resolvers }
