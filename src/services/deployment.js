const { gql, ApolloError } = require('apollo-server')
const ms = require('..')
const Deployment = ms.getModel('Deployment')
const Config = ms.getModel('Config')
const { print } = require('graphql')
const axios = require('axios').default
const { createDeployment } = require('@vercel/client')

const git = require('simple-git')

const updateBase = () =>
  git()
    .silent(true)
    .clone(ms.config.get('deploy.remote'), `${process.env.PWD}/tmp/project`)
    .then(() => console.log('finished'))
    .catch((err) => console.error('failed: ', err))

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
    desc: String
  }
`

const vercelDeploy = async (deployment) => {
  for await (const event of createDeployment(
    {
      token: ms.config.get('deploy.token'),
      path: `${process.env.PWD}/tmp/project`
    },
    {
      project: 'web',
      target: 'production',
      projectSettings: {
        framework: null
      }
    }
  )) {
    deployment.desc = event.type
    if (event.type === 'ready') {
      return
    }

    await deployment.save()
  }
}

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
    startDeploy: async (_, { _id }) => {
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
        settings
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

      updateBase().then(() => {
        vercelDeploy(deployment).then(async () => {
          deployment.status = 'ok'
          await Config.findOneAndUpdate(
            { _id: 'settings' },
            { $set: { status: 'ok' } }
          ).exec()
          await Promise.all(promises)

          await Deployment.find()
            .sort('-date')
            .skip(ms.config.get('deploy.max') || 32)
            .exec()
            .then(
              (deployments) =>
                deployments &&
                deployments.length &&
                Deployment.deleteMany({
                  _id: { $in: deployments.map(({ _id }) => _id) }
                })
            )
          await deployment.save()
        })
      })

      return deployment
    }
  }
}

module.exports = { typeDefs, resolvers }
