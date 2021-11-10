const { Schema } = require('mongoose')

module.exports = new Schema({
  ip: { type: String, unique: true },
  date: { type: Date, default: Date.now },
  source: {
    type: String,
    enum: ['instagram', 'facebook', 'whatsapp']
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet']
  },
  userAgent: String,
  origin: String,
  geolocation: Schema.Types.Mixed
})
