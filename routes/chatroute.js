const express = require('express');
const pool = require('../database/db');
const authJwt = require('../middleware/authjwt');

const router = express.Router();


router.post('/conversations', authJwt, async (req, res) => {
  const { recruiterId, candidateId, jobId } = req.body || {};
  if (!recruiterId || !candidateId) {
    return res.status(400).json({ message: 'recruiterId and candidateId required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[ex]] = await conn.query(
      'SELECT id FROM conversations WHERE recruiter_id = ? AND candidate_id = ? FOR UPDATE',
      [recruiterId, candidateId]
    );
    if (ex) {
      await conn.commit();
      conn.release();
      return res.json({ id: ex.id });
    }

    const [r] = await conn.execute(
      'INSERT INTO conversations (recruiter_id, candidate_id, job_id) VALUES (?,?,?)',
      [recruiterId, candidateId, jobId || null]
    );

    await conn.commit();
    conn.release();
    return res.status(201).json({ id: r.insertId });
  } catch (e) {
    await conn.rollback();
    conn.release();
    console.error('create convo error', e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List of my conversations
router.get('/my-conversations', authJwt, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.recruiter_id,
       c.candidate_id,
       c.last_message      AS lastMessage,
       c.last_message_at   AS lastMessageAt,
       c.created_at        AS createdAt,
       r.name              AS recruiterName,
       cand.name           AS candidateName
     FROM conversations c
     JOIN users r    ON r.id    = c.recruiter_id
     JOIN users cand ON cand.id = c.candidate_id
     WHERE c.recruiter_id = ? OR c.candidate_id = ?
     ORDER BY c.last_message_at DESC, c.created_at DESC`,
    [req.user.id, req.user.id]
  );
  res.json({ items: rows });
});

// Load messages
router.get('/conversations/:id/messages', authJwt, async (req, res) => {
  const convId = Number(req.params.id);
  const afterId = Math.max(parseInt(req.query.afterId || '0', 10), 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

  const [[conv]] = await pool.query(
    'SELECT recruiter_id, candidate_id FROM conversations WHERE id = ?',
    [convId]
  );
  if (!conv) return res.status(404).json({ message: 'Conversation not found' });
  if (![conv.recruiter_id, conv.candidate_id].includes(req.user.id)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const [rows] = await pool.execute(
    `SELECT id, conversation_id AS conversationId, sender_id AS senderId,
            type, text, created_at AS createdAt
     FROM messages
     WHERE conversation_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [convId, afterId, limit]
  );
  res.json({ items: rows });
});

// Send text
router.post('/conversations/:id/messages', authJwt, async (req, res) => {
  const convId = Number(req.params.id);
  const { text = '' } = req.body || {};
  if (!text.trim()) return res.status(400).json({ message: 'text required' });

  const [[conv]] = await pool.query(
    'SELECT recruiter_id, candidate_id FROM conversations WHERE id = ?',
    [convId]
  );
  if (!conv) return res.status(404).json({ message: 'Conversation not found' });
  if (![conv.recruiter_id, conv.candidate_id].includes(req.user.id)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const [r] = await pool.execute(
    `INSERT INTO messages (conversation_id, sender_id, type, text)
     VALUES (?, ?, 'text', ?)`,
    [convId, req.user.id, text]
  );

  await pool.execute(
    'UPDATE conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?',
    [text, convId]
  );

  const msg = {
    id: r.insertId,
    conversationId: convId,
    senderId: req.user.id,
    type: 'text',
    text,
    createdAt: new Date().toISOString(),
  };

  const io = req.app.get('io');
  if (io) io.to(`conv:${convId}`).emit('chat:new', msg);

  res.status(201).json(msg);
});

module.exports = router;