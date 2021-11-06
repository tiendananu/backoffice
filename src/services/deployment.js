const { gql, ApolloError } = require('apollo-server')
const ms = require('..')
const Deployment = ms.getModel('Deployment')
const Config = ms.getModel('Config')
const { print } = require('graphql')
const axios = require('axios').default

const typeDefs = gql`
  extend type Query {
    deployStatus: String @auth
    deployments: [Deployment] @auth(requires: USER)
  }
  extend type Mutation {
    startDeploy(_id: ID): Deployment @auth(requires: USER)
  }

  type Deployment {
    _id: ID
    date: String
    settings: Settings
    status: String
  }
`

const resolvers = {
  Query: {
    deployStatus: () =>
      Config.findOne({ _id: 'settings' })
        .select('status')
        .exec()
        .then((settings) => settings.toObject().status),
    deployments: () => Deployment.find().sort('-date').exec()
  },
  Mutation: {
    startDeploy: async (_, { _id }, { log }) => {
      let settings
      if (_id) {
        const existingDeployment = await Deployment.findOne({ _id }).exec()
        if (!existingDeployment) return new ApolloError('deployment not found')

        settings = await Config.findOneAndUpdate(
          { _id: 'settings' },
          { $set: { settings, status: 'info' } },
          { new: true }
        ).exec()
      } else {
        settings = await Config.findOneAndUpdate(
          { _id: 'settings' },
          { $set: { status: 'info' } },
          { new: true }
        ).exec()
      }

      const deployment = await new Deployment({
        settings,
        status: 'info'
      }).save()

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
              { $set: { status: 'ok' } }
            ).exec()

            deployment.status = 'ok'
            deployment.save()
            Deployment.find()
              .sort('-date')
              .skip(ms.config.get('deployments.max') || 32)
              .exec()
              .then(
                (deployments) =>
                  deployments &&
                  deployments.length &&
                  Deployment.deleteMany({
                    _id: { $in: deployments.map(({ _id }) => _id) }
                  })
              )
          }, ms.config.get('vercel.estimatedDeployTime') || 120000)

          return deployment
        })
        .catch((e) => {
          log('error while updating settings', e.toString(), 'error')
          Config.findOneAndUpdate(
            { _id: 'settings' },
            { $set: { status: 'error' } }
          ).exec()

          deployment.status = 'error'
          return deployment.save()
        })
    }
  }
}

module.exports = { typeDefs, resolvers }
