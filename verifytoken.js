const jwt = require('jsonwebtoken');
require('dotenv').config();

function verifyToken(req, res, next) {
  let token = req.headers['authorization']?.split(' ')[1];
  
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });

    req.user = decoded; 
    next(); 
  });
}

module.exports = verifyToken;
