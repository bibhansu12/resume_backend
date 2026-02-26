// BACKEND/routes/jobroute.js
const express = require('express');
const db = require('../database/db');
const verifyToken = require('../verifytoken');
const requireRecruiter = require('../middleware/requireRecruiter');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// --------------------------------------------------
//  Helper: optional token (for public GET & apply)
// --------------------------------------------------
function verifyTokenOptional(req, _res, next) {
  const header = req.headers['authorization'];
  if (!header) return next();

  const token = header.split(' ')[1];
  if (!token) return next();

  jwt.verify(
    token,
    process.env.JWT_SECRET || 'secret123',
    (err, user) => {
      if (!err) req.user = user; // { id, email, role, name }
      next();
    }
  );
}

// --------------------------------------------------
//  Multer setup for CV upload
// --------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, Date.now() + '-' + safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
});

// ==================================================
//  POST /api/jobs              -> create job
//  GET  /api/jobs              -> list jobs
//  POST /api/jobs/:jobId/apply -> apply with CV
// ==================================================

// -------------------- CREATE JOB (recruiter) --------------------
router.post('/', verifyToken, requireRecruiter, async (req, res) => {
  try {
    const recruiterId = req.user.id;
    const {
      title,
      company,
      location,
      experienceLevel,
      workMode,
      isUrgent,
      description,
    } = req.body;

    if (
      !title ||
      !company ||
      !location ||
      !experienceLevel ||
      !workMode ||
      !description
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [result] = await db.query(
      `INSERT INTO jobs
       (recruiter_id, title, company, location,
        experience_level, work_mode, is_urgent, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recruiterId,
        title,
        company,
        location,
        experienceLevel,
        workMode,
        isUrgent ? 1 : 0,
        description,
      ]
    );

    const [rows] = await db.query('SELECT * FROM jobs WHERE id = ?', [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -------------------- LIST JOBS --------------------
router.get('/', verifyTokenOptional, async (req, res) => {
  try {
    const { title = '', mine } = req.query;

    let sql = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];

    // If recruiter asks for mine=true, filter by recruiter_id
    if (mine === 'true' && req.user && req.user.role === 'recruiter') {
      sql += ' AND recruiter_id = ?';
      params.push(req.user.id);
    }

    // Search by title
    if (title) {
      sql += ' AND title LIKE ?';
      params.push(`%${title}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get jobs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -------------------- APPLY TO JOB (CV + details) --------------------
router.post(
  '/:jobId/apply',
  verifyTokenOptional,
  upload.single('cv'),          // expects field name 'cv' from frontend
  async (req, res) => {
    try {
      // Debug: see exactly what we receive
      console.log('=== APPLY REQUEST ===');
      console.log('headers:', req.headers['content-type']);
      console.log('body:', req.body);
      console.log('file:', req.file);

      const { jobId } = req.params;
      const {
        name,
        email,
        phone,
        gender,
        country,
        address,
        education,
        experience,
      } = req.body;

      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // find job & recruiter
      const [jobRows] = await db.query('SELECT * FROM jobs WHERE id = ?', [
        jobId,
      ]);
      if (jobRows.length === 0) {
        return res.status(404).json({ message: 'Job not found' });
      }
      const job = jobRows[0];

      // candidate id from token if logged in as candidate, else 0
      const candidateId =
        req.user && req.user.role === 'candidate' ? req.user.id : 0;

      const cvPath = req.file ? `/uploads/${req.file.filename}` : null;

      const [result] = await db.query(
        `INSERT INTO applications
         (job_id, recruiter_id, candidate_id,
          name, email, cv_url, phone, gender, country, address,
          education, experience, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied')`,
        [
          jobId,
          job.recruiter_id,
          candidateId,
          name,
          email,
          cvPath,
          phone || null,
          gender || null,
          country || null,
          address || null,
          education || null,
          experience || null,
        ]
      );

      const [rows] = await db.query(
        'SELECT * FROM applications WHERE id = ?',
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('Apply error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;