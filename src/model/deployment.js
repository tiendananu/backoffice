const { Schema } = require('mongoose')

module.exports = new Schema({
  date: { type: Date, default: Date.now },
  settings: Schema.Types.Mixed,
  status: {
    type: String,
    default: 'deploying',
    enum: ['deployed', 'error', 'deploying']
  }
})
