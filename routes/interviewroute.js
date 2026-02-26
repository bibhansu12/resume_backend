const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { makeMeetingSignature, getZak } = require('../utils/zoom');
const router = express.Router();


function requireAuth(req, res, next) {
  const uid = Number(req.headers['x-user-id']);
  const role = req.headers['x-user-role'] || 'recruiter';
  const name = req.headers['x-user-name'] || 'User';
  if (!uid) return res.status(401).json({ message: 'Unauthenticated' });
  req.user = { id: uid, role, name };
  next();
}

router.get('/:id/join-token', requireAuth, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM interviews WHERE id = ?', [req.params.id]);
  const itv = rows[0];
  if (!itv) return res.status(404).json({ message: 'Not found' });
  if (![itv.recruiter_id, itv.candidate_id].includes(req.user.id)) return res.status(403).json({ message: 'Forbidden' });

  const token = jwt.sign(
    {
      sub: req.user.id,
      iid: itv.id,
      name: req.user.name || 'Participant',
      role: req.user.id === itv.recruiter_id ? 'recruiter' : 'candidate',
    },
    process.env.JOIN_TOKEN_SECRET || 'dev_join_secret',
    { expiresIn: '5m' }
  );
  res.json({ token });
});

router.get('/:id/join-page', async(req,res) => {
    try{
        const t = req.query.t;
        if (!t) return res.status(401).send('Missing token');
        const claims = jwt.verify(t, process.env.JOIN_TOKEN_SECRET || 'dev_join_secret');

        const [rows] = await pool.execute('SELECT * FROM interviews WHERE id = ?', [req.params.id]);
        const itv = rows[0];
        if (!itv) return res.status(404).send('Not found');
        if (![itv.recruiter_id, itv.candidate_id].includes(claims.sub)) return res.status(403).send('Forbidden');

        const wantsHost = req.query.host === '1' && claims.sub === itv.recruiter_id;
        let role = 0, zak;
        if (wantsHost) try { zak = await getZak(); if (zak) role = 1; } catch {}

        const 

        /*
        code remaining here 

        */

        

    }
})
