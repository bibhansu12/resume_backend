
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');

const jobRoute = require('../routes/jobroute');
const applicationRoute = require('../routes/applicationroute');
const notificationRoute = require('../routes/notificationroute');
const { startInterviewReminderCron } = require('../cron/interviewreminder');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Existing routes
app.use('/api/cv', require('../routes/cvroute'));
app.use('/api/auth', require('../routes/resume.auth.login'));
app.use('/api/jobs', jobRoute);
app.use('/api/applications', applicationRoute);
app.use('/api/notifications', notificationRoute);
app.use('/api/payment', require('../routes/paymentroute'));


app.use('/api/chat', require('../routes/chatroute')); 

// Generic /api router (AI)
app.use('/api/interview', require('../routes/interviewroute'));
app.use('/api', require('../routes/airoute'));


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err?.stack || err);
  res.status(500).json({ message: 'Internal server error' });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : '*',
    credentials: true,
  },
});


app.set('io', io);


io.on('connection', (socket) => {
  const userId = Number(socket.handshake.auth?.userId);
  if (userId) socket.join(`user:${userId}`);

  socket.on('chat:join', ({ conversationId }) => {
    const cid = Number(conversationId);
    if (cid) socket.join(`conv:${cid}`);
  });

  socket.on('chat:leave', ({ conversationId }) => {
    const cid = Number(conversationId);
    if (cid) socket.leave(`conv:${cid}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and accessible from network`);
  startInterviewReminderCron();
});