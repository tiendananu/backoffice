const ms = require('..')

module.exports = (req, res) => {
  if (!req.headers.authorization) return res.end()

  const token = req.headers.authorization.replace('Bearer ', '')

  const session = ms.verify(token)
  if (!session || !session.user) return res.end()

  delete session.exp
  delete session.iat
  res.end(ms.sign(session))
}
