const { gql, ApolloError } = require('apollo-server')
const ms = require('..')
const crypto = require('../crypto')
const Credential = ms.getModel('Credential')

const typeDefs = gql`
  extend type Query {
    exists(_id: ID): Boolean
    token: Token
  }

  extend type Mutation {
    login(_id: ID, password: String, remember: Boolean): Token
    signup(_id: ID!, password: String!): Boolean
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
    }
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
    signup: (_, { _id, password }) =>
      Boolean(new Credential(crypto.generate({ _id, password })).save())
  }
}

module.exports = { typeDefs, resolvers }
