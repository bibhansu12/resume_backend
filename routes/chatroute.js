const express = require('express');
const pool = require('../db');
const router = express.Router();

function requireAuth(req, res, next) {
  const uid = Number(req.headers['x-user-id']);
  const role = req.headers['x-user-role'] || 'recruiter';
  const name = req.headers['x-user-name'] || 'User';
  if (!uid) return res.status(401).json({ message: 'Unauthenticated' });
  req.user = { id: uid, role, name };
  next();
}

function parseZoomLink(urlStr){
    try{
        const u = new URL(urlStr);
        const m = u.pathname.match(/\/(j|w)\/(\d+)/);
        const meetingNumber = m ? m[2] : null;
        const passcode = u.searchParams.get('passcode') || u.searchParams.get('pwd') || '';
        return { meetingNumber, passcode };
    }catch{
        return { meetingNumber: null, passcode: '' };


    }
}

router.post('/conversations', requireAuth, async (req, res) => {
  const { recruiterId, candidateId, jobId } = req.body || {};
  if (!recruiterId || !candidateId) return res.status(400).json({ message: 'recruiterId and candidateId required' });

const [[ex]] = await pool.query(
'SELECT id FROM conversations WHERE recruiter_id = ? AND candidate_id = ? LIMIT 1',
[recruiterId, candidateId]

);

if(ex) return res.json({ id: ex.id });

const[result] = await pool.execute(
    'INSERT INTO conversations (recruiter_id, candidate_id, job_id) VALUES (?,?,?)',
    [recruiterId, candidateId, jobId || null]
);
res.status(201).json({ id: result.insertId });
});

router.get('/my-conversations', requireAuth, async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT id, recruiter_id, candidate_id, last_message AS lastMessage,
            last_message_at AS lastMessageAt, created_at AS createdAt
     FROM conversations
     WHERE recruiter_id = ? OR candidate_id = ?
     ORDER BY last_message_at DESC, created_at DESC`,
    [req.user.id, req.user.id]
  );
  res.json({ items: rows });
});

router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
const convId = Number(req.params.id);
const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

const [[conv]] = await pool.query('SELECT recruiter_id, candidate_id FROM conversations WHERE id = ?', [convId]);
if (!conv) return res.status(404).json({ message: 'Conversation not found' });
if (![conv.recruiter_id, conv.candidate_id].includes(req.user.id)) return res.status(403).json({ message: 'Forbidden' });

const[rows] = await pool.execute(
  `SELECT id, conversation_id AS conversationId, sender_id AS senderId,
            type, text, zoom_link AS zoomLink, interview_id AS interviewId,
            created_at AS createdAt
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [convId, limit]
);
res.join({items:row});
});


router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const convId = Number(req.params.id);
  const { type = 'text', text = '', zoomLink = '' } = req.body || {};

  const [[conv]] =await pool.query ('SELECT * FROM conversations WHERE id =?', [convId]);
  if (!conv) return res.status(404).json({ message: 'Conversation not found' });

  let interviewId = null;
  let safeText = text?.toString() || '';
  let safezoom = null;

  if (type === 'zoom') {
    const { meetingNumber, passcode } = parseZoomLink(zoomLink);
    if (!meetingNumber) return res.status(400).json({ message: 'Invalid Zoom link' });

     const [itvRes] = await pool.execute(
      `INSERT INTO interviews (recruiter_id, candidate_id, message, zoom_join_url, meeting_number, passcode, scheduled_at, status, conversation_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'sent', ?)`
       [conv.recruiter_id, conv.candidate_id, 'Zoom link shared in chat', zoomLink, meetingNumber, passcode || null, convId]
     );

     interviewId = itvRes.insertId;
     safeZoom = zoomLink;
  }
  const [msgRes] = await pool.execute(
    `INSERT INTO messages (conversation_id, sender_id, type, text, zoom_link, interview_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [convId, req.user.id, type, type === 'text' ? safeText : null, safeZoom, interviewId]
  );

 await pool.execute(
    'UPDATE conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?',
    [type === 'text' ? safeText : '[Zoom link]', convId]
  );

  const message = {
    id: msgRes.insertId,
    conversationId: convId,
    senderId: req.user.id,
    type,
    text: type === 'text' ? safeText : null,
    zoomLink: safeZoom,
    interviewId,
    createdAt: new Date().toISOString()
  };

  const io = req.app.get('io');
  io.to(`conv:${convId}`).emit('chat:new', message);

  res.status(201).json(message);
});

module.exports = router;









    
















