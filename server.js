const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'doctor_finder_secret_key_default';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname)));

// Helper: Email validation regex
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// -------------------------------------------------------------
// POST /api/auth/register
// Handles registration for both Patient and Doctor
// -------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      role,
      first_name,
      last_name,
      email,
      phone,
      gender,
      date_of_birth,
      password,
      // Doctor-specific fields
      specialty,
      bmdc_reg_no,
      consultation_fee,
      chamber_name,
      chamber_address,
      available_days
    } = req.body;

    // 1. Role validation
    if (!role || !['patient', 'doctor'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified.' });
    }

    // 2. Required fields validation
    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }

    // 3. Email format validation
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    // 4. Password validation
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // 5. Check if email already registered
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [trimmedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered. Please log in or use another email.' });
    }

    // 6. Secure password hashing
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Format fields for insertion
    const dob = date_of_birth && date_of_birth.trim() !== '' ? date_of_birth : null;
    const fee = consultation_fee ? parseFloat(consultation_fee) : null;
    const daysStr = Array.isArray(available_days) ? available_days.join(', ') : (available_days || null);

    // 7. Store user into MySQL
    const insertQuery = `
      INSERT INTO users (
        first_name,
        last_name,
        phone,
        email,
        gender,
        date_of_birth,
        password_hash,
        role,
        specialty,
        bmdc_reg_no,
        consultation_fee,
        chamber_name,
        chamber_address,
        available_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertQuery, [
      first_name.trim(),
      last_name.trim(),
      phone.trim(),
      trimmedEmail,
      gender || null,
      dob,
      password_hash,
      role,
      specialty || null,
      bmdc_reg_no || null,
      fee,
      chamber_name || null,
      chamber_address || null,
      daysStr
    ]);

    return res.status(201).json({
      success: true,
      message: `${role === 'patient' ? 'Patient' : 'Doctor'} account created successfully!`,
      userId: result.insertId,
      role: role
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration. Please try again later.'
    });
  }
});

// -------------------------------------------------------------
// POST /api/auth/login
// Handles login for both Patient and Doctor
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // 1. Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    // 2. Fetch user from MySQL
    const [users] = await pool.query(
      'SELECT id, first_name, last_name, phone, email, gender, role, password_hash FROM users WHERE email = ?',
      [trimmedEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
    }

    const user = users[0];

    // Optional check: verify if the chosen role matches the account role
    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `This email is registered as a ${user.role}, not a ${role}. Please select the ${user.role} tab.`
      });
    }

    // 3. Verify password securely
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    // 4. Generate JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Send successful response with user details (excluding password_hash)
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token: token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login. Please try again later.'
    });
  }
});

// -------------------------------------------------------------
// GET /api/auth/me
// Returns current authenticated user profile
// -------------------------------------------------------------
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const [users] = await pool.query(
      'SELECT id, first_name, last_name, phone, email, gender, role, specialty, chamber_name FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, user: users[0] });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`DoctorFinder Server running on http://localhost:${PORT}`);
});
