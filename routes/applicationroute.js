// BACKEND/routes/applicationroute.js
const express = require('express');
const db = require('../database/db');
const verifyToken = require('../verifytoken');
const requireRecruiter = require('../middleware/requireRecruiter');

const router = express.Router();


router.get('/', verifyToken, requireRecruiter, async (req, res) => {
  try {
    const recruiterId = req.user.id;

    const sql = `
      SELECT
        a.*,
        j.title       AS job_title,
        j.company     AS job_company,
        j.location    AS job_location,
        j.experience_level AS job_experience_level,
        j.work_mode   AS job_work_mode,
        j.is_urgent   AS job_is_urgent,
        j.description AS job_description
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE a.recruiter_id = ?
      ORDER BY a.created_at DESC
    `;

    const [rows] = await db.query(sql, [recruiterId]);

    const result = rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      recruiterId: r.recruiter_id,
      candidateId: r.candidate_id,
      name: r.name,
      email: r.email,
      cvUrl: r.cv_url,            
      phone: r.phone,
      gender: r.gender,
      country: r.country,
      address: r.address,
      education: r.education,
      experience: r.experience,
      status: r.status,
      createdAt: r.created_at,
      job: {
        id: r.job_id,
        title: r.job_title,
        company: r.job_company,
        location: r.job_location,
        experienceLevel: r.job_experience_level,
        workMode: r.job_work_mode,
        isUrgent: !!r.job_is_urgent,
        description: r.job_description,
      },
    }));

    res.json(result);
  } catch (err) {
    console.error('Get applications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- UPDATE STATUS ----------
router.patch('/:id/status', verifyToken, requireRecruiter, async (req, res) => {
  try {
    const recruiterId = req.user.id;
    const { id } = req.params;
    

    const { status, message, zoomLink } = req.body;

    const allowed = ['applied', 'accepted', 'rejected', 'interview'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const [check] = await db.query(
      'SELECT * FROM applications WHERE id = ? AND recruiter_id = ?',
      [id, recruiterId]
    );
    if (check.length === 0) {
      return res
        .status(404)
        .json({ message: 'Application not found or not yours' });
    }

    const application = check[0];

    await db.query('UPDATE applications SET status = ? WHERE id = ?', [
      status,
      id,
    ]);

    if (status === 'accepted'){
      const defaultMsg = 'Congratulations $(application.name), you have been accepted for next round';
      const finalMessage =  message && message.trim() !== '' ? message : defaultMsg;

      await db.query(
       ` INSERT INTO notifications
        (candidate_id, recruiter_id, application_id, job_id, message, zoom_link)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
        application.candidate_id,
          recruiterId,
          application.id,
          application.job_id,
          finalMessage,
          zoomLink || null,
        
        ]

      );
    }

    const [rows] = await db.query(
      `SELECT
         a.*,
         j.title       AS job_title,
         j.company     AS job_company,
         j.location    AS job_location,
         j.experience_level AS job_experience_level,
         j.work_mode   AS job_work_mode,
         j.is_urgent   AS job_is_urgent,
         j.description AS job_description
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = ?`,
      [id]
    );

    const r = rows[0];
    const result = {
      id: r.id,
      jobId: r.job_id,
      recruiterId: r.recruiter_id,
      candidateId: r.candidate_id,
      name: r.name,
      email: r.email,
      cvUrl: r.cv_url,
      phone: r.phone,
      gender: r.gender,
      country: r.country,
      address: r.address,
      education: r.education,
      experience: r.experience,
      status: r.status,
      createdAt: r.created_at,
      job: {
        id: r.job_id,
        title: r.job_title,
        company: r.job_company,
        location: r.job_location,
        experienceLevel: r.job_experience_level,
        workMode: r.job_work_mode,
        isUrgent: !!r.job_is_urgent,
        description: r.job_description,
      },
    };

    res.json(result);
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;