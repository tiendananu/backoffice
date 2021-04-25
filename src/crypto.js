const crypto = require('crypto')
const { config } = require('.')
const validate = ({ password, hash, salt }) =>
  hash ==
  crypto
    .createHash(config.get('login.algorithm'))
    .update(password + salt)
    .digest('hex')

const generate = ({ _id, password }) => {
  const salt = crypto.randomBytes(config.get('login.saltBytes')).toString()
  const hash = crypto
    .createHash(config.get('login.algorithm'))
    .update(password + salt)
    .digest('hex')
  return { _id, username: _id, hash, salt }
}

module.exports = { validate, generate }
