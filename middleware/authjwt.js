
const jwt = require('jsonwebtoken');


function authJwt(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      const rawId = payload.id ?? payload.userId ?? payload.sub;
      const id = typeof rawId === 'string' ? Number(rawId) : Number(rawId);
      req.user = {
        id,
        role: payload.role || req.headers['x-user-role'] || 'candidate',
        name: payload.name || req.headers['x-user-name'] || 'User',
      };
      return next();
    } catch (_) {}
  }

  const uid = Number(req.headers['x-user-id']);
  if (uid) {
    req.user = {
      id: uid,
      role: req.headers['x-user-role'] || 'candidate',
      name: req.headers['x-user-name'] || 'User',
    };
    return next();
  }

  return res.status(401).json({ message: 'Unauthenticated' });
}

module.exports = authJwt;