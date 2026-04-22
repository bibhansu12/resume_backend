const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const db = require('../database/db');

router.get('/applications', async (req, res) => {
  try {
    const recruiterId = req.query.recruiterId;

    if (!recruiterId) {
      return res.status(400).json({ message: 'recruiterId is required' });
    }

    const [rows] = await db.execute(
      `SELECT 
        a.id AS applicationId,
        a.candidate_id AS candidateId,
        a.name,
        a.email,
        a.status,
        a.job_id AS jobId
       FROM applications a
       WHERE a.recruiter_id = ?
       ORDER BY a.id DESC`,
      [recruiterId]
    );

    res.json(rows);
  } catch (e) {
    console.error('Fetch applications error:', e);
    res.status(500).json({ message: 'Failed to fetch applications' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const {
      recruiterId,
      candidateId,
      recruiterName,
      candidateName,
      candidateEmail,
      message,
      scheduledAt,
      applicationId,
      jobId,
    } = req.body;

    if (!recruiterId || !candidateId) {
      return res.status(400).json({
        message: 'recruiterId and candidateId are required',
      });
    }

    const interviewId = crypto.randomBytes(8).toString('hex');
    const channelName = `interview-${interviewId}`;

    const inviteLink = `http://localhost:3000/interview/join/${interviewId}`;

    const [result] = await db.execute(
      `INSERT INTO interviews
      (recruiter_id, candidate_id, message, zoom_join_url, meeting_number, passcode, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        recruiterId,
        candidateId,
        message || `Interview invitation for ${candidateName || 'Candidate'}`,
        inviteLink,
        channelName,
        interviewId,
        scheduledAt || null,
      ]
    );

    if (applicationId && jobId) {
      await db.execute(
        `INSERT INTO notifications
         (candidate_id, recruiter_id, application_id, job_id, message, zoom_link, is_read, created_at, reminder_sent)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 0)`,
        [
          candidateId,
          recruiterId,
          applicationId,
          jobId,
          'Interview is happening now! Click to join.',
          inviteLink,
        ]
      );
    }

    res.json({
      id: result.insertId,
      interviewId,
      channel: channelName,
      inviteLink,
      recruiterName,
      candidateName,
      candidateEmail,
    });
  } catch (e) {
    console.error('Create interview error:', e);
    res.status(500).json({ message: 'Failed to create interview' });
  }
});

router.get('/session/:interviewId', async (req, res) => {
  try {
    const { interviewId } = req.params;

    const [rows] = await db.execute(
      `SELECT
        i.id,
        i.recruiter_id AS recruiterId,
        i.candidate_id AS candidateId,
        i.message,
        i.zoom_join_url AS inviteLink,
        i.meeting_number AS channel,
        i.passcode AS interviewId,
        i.scheduled_at AS scheduledAt,
        i.status,
        a.name AS candidateName,
        a.email AS candidateEmail
      FROM interviews i
      LEFT JOIN applications a
        ON a.candidate_id = i.candidate_id
      WHERE i.passcode = ?
      LIMIT 1`,
      [interviewId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('Fetch session error:', e);
    res.status(500).json({ message: 'Failed to fetch session' });
  }
});


router.get('/my-session', async (req, res) => {
  try {
    const parts = req.headers.authorization?.split(' ');
    if (!parts || parts.length !== 2) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    
    const candidateId = req.query.candidateId;

    if (!candidateId) {
      return res.status(400).json({ message: 'candidateId is required' });
    }

    const [rows] = await db.execute(
      `SELECT 
        i.id,
        i.passcode AS interviewId,
        i.meeting_number AS channel,
        i.status
       FROM interviews i
       WHERE i.candidate_id = ?
       ORDER BY i.id DESC
       LIMIT 1`,
      [candidateId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No interview found' });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('My session error:', e);
    res.status(500).json({ message: 'Failed to load session' });
  }
});

router.patch('/status/:interviewId', async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['sent', 'scheduled', 'started', 'completed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}`,
      });
    }

    await db.execute(
      `UPDATE interviews
       SET status = ?
       WHERE passcode = ?`,
      [status, interviewId]
    );

    res.json({
      success: true,
      interviewId,
      status,
    });
  } catch (e) {
    console.error('Update status error:', e);
    res.status(500).json({ message: 'Failed to update interview status' });
  }
});

router.get('/token', (req, res) => {
  try {
    const appId = process.env.AGORA_APP_ID;
    const appCert = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCert) {
      return res.status(500).json({ message: 'Missing Agora credentials' });
    }

    const channel = String(req.query.channel || '').trim();
    if (!channel) {
      return res.status(400).json({ message: 'channel is required' });
    }

    const uid = parseInt(String(req.query.uid ?? '0'), 10) || 0;

    const roleParam = String(req.query.role || 'host').toLowerCase();
    const role =
      roleParam === 'audience'
        ? RtcRole.SUBSCRIBER
        : RtcRole.PUBLISHER;

    const expire = 60 * 60 * 2;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTimestamp + expire;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCert,
      channel,
      uid,
      role,
      privilegeExpireTs
    );

    res.json({
      appId,
      token,
      channel,
      uid,
      expireInSec: expire,
    });
  } catch (e) {
    console.error('Agora token error:', e);
    res.status(500).json({ message: 'Failed to generate token' });
  }
});

module.exports = router;