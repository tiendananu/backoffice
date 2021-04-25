const { Schema } = require('mongoose')

module.exports = new Schema({
  _id: String,
  user: String,
  operation: String,
  ip: String,
  module: String,
  date: { type: Date, default: Date.now },
  environment: { type: String, enum: ['development', 'staging', 'production'] },
  logs: [
    {
      timestamp: { type: Date, default: Date.now },
      message: String,
      data: Schema.Types.Mixed,
      type: { type: String, enum: ['log', 'info', 'error', 'warning'] }
    }
  ]
})
