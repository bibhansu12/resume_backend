
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const verifyToken = require('../verifytoken');
const emailService = require('../service/emailService');
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
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const [result] = await db.query(
      `INSERT INTO users (name, email, role, password, created_at, last_login, is_verified, verification_otp, otp_expiry)
       VALUES (?, ?, ?, ?, NOW(), NOW(), 0, ?, ?)`,
      [name, email, role, hashedPassword, otp, otpExpiry]
    );

    // Send verification email
    const emailHtml = emailService.buildVerificationEmailHtml(otp);
    await emailService.sendEmail({
      to: email,
      subject: 'Verify your RecruitApp account',
      html: emailHtml,
    });

    res.status(201).json({
      message: 'Registration successful. Please check your email for the verification code.',
      email,
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ message: 'Error registering user' });
  }
});

// Verify OTP Route
route.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? AND verification_otp = ?',
      [email, otp]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const user = rows[0];

    // Check expiry
    if (new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Activate user
    await db.query(
      'UPDATE users SET is_verified = 1, verification_otp = NULL, otp_expiry = NULL WHERE id = ?',
      [user.id]
    );

    // Generate Token
    const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '3h' }
    );

    res.json({
      message: 'Email verified successfully. You are now logged in.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Verification Error:', err);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

// Resend OTP Route
route.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];
    if (user.is_verified) {
      return res.status(400).json({ message: 'Account is already verified' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE users SET verification_otp = ?, otp_expiry = ? WHERE id = ?',
      [otp, otpExpiry, user.id]
    );

    const emailHtml = emailService.buildVerificationEmailHtml(otp);
    await emailService.sendEmail({
      to: email,
      subject: 'Your new verification code',
      html: emailHtml,
    });

    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    console.error('Resend OTP Error:', err);
    res.status(500).json({ message: 'Server error resending OTP' });
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
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    console.log(rows)
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];

    // Checks if verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        message: 'Please verify your email before logging in.', 
        unverified: true,
        email: user.email 
      });
    }

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

route.post('/forgot-password', async (req, res) => {
  console.log('Forgot password request for:', req.body.email);
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User with this email not found' });
    }

    const user = rows[0];
    
   
    const newPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);

    
    const emailHtml = emailService.buildForgotPasswordEmailHtml(newPassword, user.name);
    const emailResult = await emailService.sendEmail({
      to: email,
      subject: "Password Reset - RecruitApp",
      html: emailHtml,
    });

    if (!emailResult.success) {
      throw new Error('Failed to send reset email');
    }

    res.json({ 
      message: 'A new temporary password has been emailed to you.',
    });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ message: 'Server error generating password reset' });
  }
});

module.exports = route;