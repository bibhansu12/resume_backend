module.exports = (req, res, next) => {
  if (req.user?.role !== 'recruiter') {
    return res.status(403).json({ message: 'Recruiter access only' });
  }
  next();
};

