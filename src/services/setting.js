const { gql } = require('apollo-server')
const ms = require('..')
const Config = ms.getModel('Config')
const { print } = require('graphql')
const axios = require('axios').default
const get = require('lodash/get')
const typeDefs = gql`
  extend type Query {
    settings: Settings @auth
    translations: [Translation] @auth
  }

  extend type Mutation {
    updateSettings(settings: Settings): Settings @auth
    updateTranslation(
      key: ID!
      newKey: String
      values: [TranslationValue]
    ): Translation @auth
    insertTranslation(key: ID!, values: [TranslationValue]): Translation @auth
    insertTranslations(translations: [InputTranslation]!): Translation @auth

    deploy: String @auth(requires: ADMIN)
  }

  input InputTranslation {
    key: ID!
    values: [TranslationValue]
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
    insertTranslations: (_, { translations }) =>
      Config.findOneAndUpdate(
        { _id: 'translations' },
        {
          $push: { translations: { $each: translations } }
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
    updateTranslation: (_, { key, newKey, values }) =>
      Config.findOneAndUpdate(
        { _id: 'translations', 'translations.key': key },
        {
          $set: {
            status: 'required',
            'translations.$.key': newKey || key,
            'translations.$.values': values
          }
        },
        {
          new: true
        }
      ).exec(),
    updateSettings: (_, { settings }) => {
      delete settings._id

      return Config.findOneAndUpdate(
        { _id: 'settings' },
        { ...settings, status: 'required' },
        {
          upsert: true,
          new: true
        }
      ).exec()
    },
    deploy: async (_, __, { log }) => {
      Config.findOneAndUpdate(
        { _id: 'settings' },
        { $set: { status: 'deploying' } }
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
        .then(() => {
          setTimeout(() => {
            Config.findOneAndUpdate(
              { _id: 'settings' },
              { $set: { status: 'ready' } }
            ).exec()
          }, ms.config.get('vercel.estimatedDeployTime') || 120000)

          return 'deploying'
        })
        .catch((e) => {
          log('error while updating settings', e.toString(), 'error')
          Config.findOneAndUpdate(
            { _id: 'settings' },
            { $set: { status: 'error' } }
          ).exec()
          return 'error'
        })
    }
  }
}

module.exports = { typeDefs, resolvers }
