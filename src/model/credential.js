const { Schema } = require('mongoose')
const { config } = require('..')

module.exports = new Schema({
  _id: {
    type: String,
    match:
      /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
    required: true,
    lowercase: true,
    trim: true,
    maxLength: 128,
    alias: 'email'
  },
  hash: String,
  salt: { type: String, max: config.get('login.saltBytes') },
  inactive: { type: Boolean },
  role: { type: String, default: 'ADMIN', enum: ['GUEST', 'USER', 'ADMIN'] },
  createdAt: { type: Date, default: Date.now() }
})
