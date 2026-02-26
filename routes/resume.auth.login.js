
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const verifyToken = require('../verifytoken');
require('dotenv').config();

const route = express.Router();


route.post('/register', async (req, res) => {
  console.log('Received signup request:', req.body);
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!['candidate', 'recruiter'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, email, role, password, created_at, last_login)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [name, email, role, hashedPassword]
    );

    const payload = { id: result.insertId, email, role, name };
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '3h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertId,
        name,
        email,
        role,
        last_login: new Date(),
      },
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ message: 'Error registering user' });
  }
});


route.post('/login', async (req, res) => {
  console.log('Login attempt received:', req.body);
  const { email, password, expectedRole } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: 'Email and password are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];

    if (expectedRole && user.role !== expectedRole) {
      return res.status(403).json({
        message: `This account is a ${user.role}, not a ${expectedRole}`,
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '3h' }
    );

    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [
      user.id,
    ]);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        last_login: new Date(),
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


route.get('/profile', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Profile fetched successfully', user: rows[0] });
  } catch (err) {
    console.error('Profile Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = route;