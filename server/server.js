require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');  // keep this as the Socket.IO class

const jobRoute = require('../routes/jobroute');
const applicationRoute = require('../routes/applicationroute');
const notificationRoute = require('../routes/notificationroute');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/cv', require('../routes/cvroute'));  
app.use('/api/auth', require('../routes/resume.auth.login'));
app.use('/api/jobs', jobRoute);
app.use('/api/applications', applicationRoute);
app.use('/api/notifications', notificationRoute);
app.use('/api', require('../routes/airoute'));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ message: "Internal server error" });
});

// create HTTP server instance with a *different* name
const server = http.createServer(app);

// attach Socket.IO to that HTTP server
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : '*',
    credentials: true
  }
});

// example: listen for connections (optional if you do it elsewhere)
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  // your socket handlers here
});

const PORT = process.env.PORT || 3000;

// IMPORTANT: listen on the HTTP server, not app
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Server running on port ${PORT} and accessible from network`)
);