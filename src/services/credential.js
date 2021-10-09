const { gql, ApolloError } = require('apollo-server')
const ms = require('..')
const crypto = require('../crypto')
const Credential = ms.getModel('Credential')

const typeDefs = gql`
  extend type Query {
    exists(_id: ID): Boolean
    token: Token
    credentials: [Credential] @auth
    credential(_id: ID!): Credential @auth
    role: Role @auth
  }
  extend type Mutation {
    login(_id: ID, password: String, remember: Boolean): Token
    signup(_id: ID!, password: String!, role: Role): Credential
    removeCredential(_id: ID!): Credential @auth(requires: ADMIN)
    updateCredential(_id: ID!, password: String, role: Role): Credential
      @auth(requires: ADMIN)
  }

  type Credential {
    _id: ID
    role: Role
    createdAt: Date
  }

  scalar Token
`

const resolvers = {
  Query: {
    exists: (_, { _id }) =>
      Credential.findOne({ _id })
        .select('_id')
        .exec()
        .then((cred) => Boolean(cred)),
    token: (_, __, context) => {
      if (!context || !context.session || !context.session.user) return null

      delete context.session.exp
      delete context.session.iat
      return ms.sign(context.session)
    },
    credentials: () =>
      Credential.find({ inactive: { $ne: true } })
        .select('_id role createdAt')
        .exec(),
    credential: (_, credential) =>
      Credential.findOne(credential).select('_id role createdAt').exec(),
    role: (_, __, { session }) =>
      Credential.findOne({ _id: session.user._id })
        .select('role')
        .exec()
        .then((credential) => (credential ? credential.role : null))
  },
  Mutation: {
    login: async (_, { _id, password, remember }) => {
      const user = await Credential.findOne({ _id }).exec()

      if (!user) return new ApolloError('User not found')
      if (user.inactive) return new ApolloError('User is inactive')

      user.password = password
      if (!crypto.validate(user)) return new ApolloError('Password is invalid')

      return ms.sign(
        { user: { _id: user._id, role: user.role } },
        remember ? { expiresIn: '1y' } : null
      )
    },
    signup: (_, { _id, password, role = 'USER' }) => {
      const credential = crypto.generate({ _id, password })
      return new Credential({ ...credential, role }).save()
    },
    updateCredential: (_, { _id, password, role }) => {
      const credential = password ? crypto.generate({ _id, password }) : { _id }

      return Credential.findOneAndUpdate(
        { _id },
        { ...credential, role },
        { new: true }
      )
        .select('_id role createdAt')
        .exec()
    },
    removeCredential: (_, credential) =>
      Credential.findOneAndRemove(credential)
        .select('_id role createdAt')
        .exec()
  }
}

module.exports = { typeDefs, resolvers }
