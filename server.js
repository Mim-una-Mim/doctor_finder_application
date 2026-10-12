const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'doctor_finder_secret_key_default';

// CORS: set ALLOWED_ORIGINS in .env as a comma-separated list for cloud deployment.
// If not set, all origins are permitted (safe for local development).
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null; // null = allow all

app.use(cors({
  origin: (origin, callback) => {
    if (!allowedOrigins || !origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files without caching during development
app.use(express.static(path.join(__dirname), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Helper: Email validation regex
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Auth Middleware: Verify JWT and extract user
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }
}

// Admin Middleware: Verify authenticated user has role 'admin'
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// -------------------------------------------------------------
// POST /api/auth/register
// Handles registration for both Patient and Doctor
// -------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const connection = await pool.getConnection();
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
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [trimmedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered. Please log in or use another email.' });
    }

    // 6. Secure password hashing
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const dob = date_of_birth && date_of_birth.trim() !== '' ? date_of_birth : null;
    const fee = consultation_fee ? parseFloat(consultation_fee) : 500.00;
    const daysArr = Array.isArray(available_days) ? available_days : (available_days ? available_days.split(',') : []);
    const daysStr = daysArr.join(', ');

    // 7. Store user into MySQL users table
    const [userResult] = await connection.query(
      `INSERT INTO users (
        first_name, last_name, phone, email, gender, date_of_birth,
        password_hash, role, specialty, bmdc_reg_no, consultation_fee,
        chamber_name, chamber_address, available_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        daysStr || null
      ]
    );

    const userId = userResult.insertId;

    // 8. If doctor, also create corresponding records in doctors, chambers, and availability
    if (role === 'doctor') {
      const docName = `Dr. ${first_name.trim()} ${last_name.trim()}`;
      const [docResult] = await connection.query(
        `INSERT INTO doctors (user_id, name, specialty, degree, bmdc_reg_no, bio)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          docName,
          specialty || 'General Physician',
          'MBBS, FCPS',
          bmdc_reg_no || null,
          `${docName} is a ${specialty || 'specialist'} practicing in Dinajpur.`
        ]
      );

      const doctorId = docResult.insertId;

      // Add chamber
      const cName = chamber_name ? chamber_name.trim() : 'Dinajpur Medical Chamber';
      const cAddr = chamber_address ? chamber_address.trim() : 'Dinajpur Sadar';
      await connection.query(
        `INSERT INTO chambers (doctor_id, location, address, fees) VALUES (?, ?, ?, ?)`,
        [doctorId, 'Sadar', `${cName}, ${cAddr}`, fee]
      );

      // Add availability
      const daysToInsert = daysArr.length > 0 ? daysArr : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
      for (const day of daysToInsert) {
        await connection.query(
          `INSERT INTO availability (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, '16:00:00', '20:00:00')`,
          [doctorId, day.trim()]
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: `${role === 'patient' ? 'Patient' : 'Doctor'} account created successfully!`,
      userId: userId,
      role: role
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration. Please try again later.'
    });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// POST /api/auth/login
// Handles login for both Patient and Doctor
// -------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    const [users] = await pool.query(
      'SELECT id, first_name, last_name, phone, email, gender, role, password_hash FROM users WHERE email = ?',
      [trimmedEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
    }

    const user = users[0];

    // Validate user role: if role tab is selected, it must match the user's actual role in the database
    if (role && user.role !== role) {
      if (role === 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Administrator privileges required.'
        });
      }
      return res.status(403).json({
        success: false,
        message: `This email is registered as a ${user.role}, not a ${role}. Please select the ${user.role.charAt(0).toUpperCase() + user.role.slice(1)} tab.`
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    // Get doctor_id if user is a doctor
    let doctorId = null;
    if (user.role === 'doctor') {
      const [docs] = await pool.query('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (docs.length > 0) {
        doctorId = docs[0].id;
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        doctorId: doctorId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token: token,
      user: {
        id: user.id,
        doctorId: doctorId,
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
// POST /api/auth/forgot-password
// Generates secure single-use reset token and emails or logs reset link
// Generic response returned to prevent email enumeration
// -------------------------------------------------------------
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Rate limiting: check recent requests from this email in the last 15 minutes
    const [recentRequests] = await pool.query(
      `SELECT COUNT(*) as count FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE u.email = ? AND pr.created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [trimmedEmail]
    );

    if (recentRequests[0] && recentRequests[0].count >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many password reset requests. Please try again after 15 minutes.'
      });
    }

    // Check if user exists
    const [users] = await pool.query(
      'SELECT id, first_name, email, role FROM users WHERE email = ?',
      [trimmedEmail]
    );

    // If user exists, generate token and save hash
    if (users.length > 0) {
      const user = users[0];

      // Invalidate any existing unused reset tokens for this user
      await pool.query(
        'UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0',
        [user.id]
      );

      // Generate cryptographically secure random token (64 hex characters)
      const rawToken = crypto.randomBytes(32).toString('hex');
      // Hash token with SHA-256 for secure DB storage
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Expiration time: 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at, used)
         VALUES (?, ?, ?, 0)`,
        [user.id, tokenHash, expiresAt]
      );

      // Construct reset URL (or app deep link)
      const baseUrl = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
      const resetUrl = `${baseUrl}/login.html?token=${rawToken}`;

      // Email transport configuration
      const mailConfig = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        } : undefined
      };

      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        try {
          const transporter = nodemailer.createTransport(mailConfig);
          await transporter.sendMail({
            from: process.env.SMTP_FROM || `"DoctorFinder" <no-reply@doctorfinder.com>`,
            to: user.email,
            subject: 'Password Reset Request - DoctorFinder',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #284a6e;">DoctorFinder Password Reset</h2>
                <p>Hello ${user.first_name},</p>
                <p>We received a request to reset your password for your ${user.role} account.</p>
                <p style="margin: 20px 0;">
                  <a href="${resetUrl}" style="background-color: #3f6f98; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                    Reset Password
                  </a>
                </p>
                <p>Or paste this link into your browser:</p>
                <p style="word-break: break-all; color: #3f6f98;"><a href="${resetUrl}">${resetUrl}</a></p>
                <p style="color: #666; font-size: 13px;">This link will expire in 1 hour. If you did not make this request, you can safely ignore this email.</p>
              </div>
            `
          });
        } catch (mailErr) {
          console.error('SMTP Mail send failed:', mailErr.message);
        }
      } else {
        // When SMTP is not configured, log clearly in server console for local testing/development
        console.log(`[PASSWORD RESET LINK for ${user.email} (${user.role})]: ${resetUrl}`);
      }
    }

    // Generic response to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email address, password reset instructions have been sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request. Please try again later.'
    });
  }
});

// -------------------------------------------------------------
// GET /api/auth/verify-reset-token
// Validates whether a reset token is valid and unexpired
// -------------------------------------------------------------
app.get('/api/auth/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const [rows] = await pool.query(
      `SELECT pr.id, pr.expires_at, pr.used, u.email, u.role, u.first_name
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token_hash = ?`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
    }

    const resetRecord = rows[0];

    if (resetRecord.used) {
      return res.status(400).json({ success: false, message: 'This password reset link has already been used.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This password reset link has expired. Please request a new one.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Token is valid.',
      email: resetRecord.email,
      role: resetRecord.role,
      first_name: resetRecord.first_name
    });

  } catch (error) {
    console.error('Verify reset token error:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying reset token.' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/reset-password
// Resets password using valid token and invalidates token
// -------------------------------------------------------------
app.post('/api/auth/reset-password', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { token, new_password, confirm_password } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required.' });
    }

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    if (confirm_password !== undefined && new_password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT pr.id, pr.user_id, pr.expires_at, pr.used, u.email, u.role
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token_hash = ? FOR UPDATE`,
      [tokenHash]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid password reset link.' });
    }

    const resetRecord = rows[0];

    if (resetRecord.used) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This reset link has already been used.' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new one.' });
    }

    // Hash the new password with bcrypt (salt rounds = 10)
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);

    // Update user password in users table
    await connection.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, resetRecord.user_id]
    );

    // Invalidate the reset token
    await connection.query(
      'UPDATE password_resets SET used = 1 WHERE id = ?',
      [resetRecord.id]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.',
      role: resetRecord.role
    });

  } catch (error) {
    await connection.rollback();
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error resetting password. Please try again.'
    });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// GET /api/auth/me
// Returns current authenticated user profile
// -------------------------------------------------------------
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, first_name, last_name, phone, email, gender, role FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = users[0];
    if (user.role === 'doctor') {
      const [docs] = await pool.query('SELECT * FROM doctors WHERE user_id = ?', [user.id]);
      if (docs.length > 0) {
        user.doctor = docs[0];
      }
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error fetching user profile.' });
  }
});

// -------------------------------------------------------------
// GET /api/doctors
// Search and filter doctors by name, specialty, location
// Includes chambers, availability, and real-time available_today calculation
// -------------------------------------------------------------
app.get('/api/doctors', async (req, res) => {
  try {
    const { search, specialty, location } = req.query;

    let query = `
      SELECT 
        d.id,
        d.user_id,
        d.name,
        d.specialty,
        d.degree,
        d.bmdc_reg_no,
        d.photo,
        d.bio,
        d.created_at
      FROM doctors d
      LEFT JOIN chambers c ON c.doctor_id = d.id
      WHERE d.approval_status = 'approved'
    `;
    const params = [];

    // Filter by search query
    if (search && search.trim() !== '') {
      const rawSearch = search.trim();
      const lowerSearch = rawSearch.toLowerCase();

      // Dictionary of recognized medical specialties and synonyms
      const specialtySynonyms = {
        'medicine': ['Medicine'],
        'internal medicine': ['Medicine'],
        'general physician': ['General Physician'],
        'general practice': ['General Physician'],
        'cardiology': ['Cardiologist'],
        'cardiologist': ['Cardiologist'],
        'heart': ['Cardiologist'],
        'pediatrics': ['Pediatrician'],
        'pediatrician': ['Pediatrician'],
        'pediatric': ['Pediatrician'],
        'child specialist': ['Pediatrician'],
        'dermatology': ['Dermatologist'],
        'dermatologist': ['Dermatologist'],
        'skin specialist': ['Dermatologist'],
        'neurology': ['Neurologist'],
        'neurologist': ['Neurologist'],
        'gynecology': ['Gynecologist'],
        'gynecologist': ['Gynecologist'],
        'gynaecology': ['Gynecologist'],
        'gynaecologist': ['Gynecologist'],
        'gynae': ['Gynecologist'],
        'psychiatry': ['Psychiatry'],
        'psychiatrist': ['Psychiatry'],
        'mental health': ['Psychiatry'],
        'ophthalmology': ['Ophthalmology'],
        'ophthalmologist': ['Ophthalmology'],
        'eye specialist': ['Ophthalmology'],
        'orthopedics': ['Orthopedics'],
        'orthopedic': ['Orthopedics'],
        'ortho': ['Orthopedics'],
        'ent': ['ENT Specialist'],
        'ent specialist': ['ENT Specialist'],
        'otolaryngology': ['ENT Specialist']
      };

      if (specialtySynonyms[lowerSearch]) {
        // Query explicitly targets a recognized specialty or synonym:
        // Match ONLY doctors whose actual specialty matches the target specialty
        const targetSpecs = specialtySynonyms[lowerSearch];
        const specPlaceholders = targetSpecs.map(() => '?').join(', ');
        query += ` AND d.specialty IN (${specPlaceholders})`;
        params.push(...targetSpecs);
      } else if (lowerSearch === 'ent') {
        // Safe fallback for whole-word ENT
        query += ` AND d.specialty = 'ENT Specialist'`;
      } else {
        // General text search (doctor name, hospital name, chamber location/address)
        // Also checks specialty as substring for partial matches like "cardio" or "neuro"
        const s = `%${rawSearch}%`;
        query += ` AND (d.name LIKE ? OR d.specialty LIKE ? OR c.location LIKE ? OR c.address LIKE ?)`;
        params.push(s, s, s, s);
      }
    }

    // Filter by specialty (case-insensitive and tolerant of common variation names)
    if (specialty && specialty !== 'all' && specialty.trim() !== '') {
      const specRaw = specialty.trim();
      const specLower = specRaw.toLowerCase();
      const specTerms = new Set([specRaw]);
      if (specLower === 'cardiology' || specLower === 'cardiologist') {
        specTerms.add('Cardiologist');
        specTerms.add('Cardiology');
      } else if (specLower === 'pediatrics' || specLower === 'pediatrician') {
        specTerms.add('Pediatrician');
        specTerms.add('Pediatrics');
      } else if (specLower === 'dermatology' || specLower === 'dermatologist') {
        specTerms.add('Dermatologist');
        specTerms.add('Dermatology');
      } else if (specLower === 'neurology' || specLower === 'neurologist') {
        specTerms.add('Neurologist');
        specTerms.add('Neurology');
      } else if (specLower === 'gynecology' || specLower === 'gynecologist') {
        specTerms.add('Gynecologist');
        specTerms.add('Gynecology');
      } else if (specLower === 'psychiatry' || specLower === 'psychiatrist') {
        specTerms.add('Psychiatry');
        specTerms.add('Psychiatrist');
      } else if (specLower === 'ophthalmology' || specLower === 'ophthalmologist') {
        specTerms.add('Ophthalmology');
        specTerms.add('Ophthalmologist');
      } else if (specLower === 'orthopedics' || specLower === 'orthopedic') {
        specTerms.add('Orthopedics');
        specTerms.add('Orthopedic');
      } else if (specLower === 'ent' || specLower === 'ent specialist') {
        specTerms.add('ENT Specialist');
        specTerms.add('ENT');
      }

      const specConditions = [];
      for (const t of specTerms) {
        specConditions.push(`LOWER(d.specialty) LIKE ?`);
        params.push(`%${t.toLowerCase()}%`);
      }
      query += ` AND (${specConditions.join(' OR ')})`;
    }

    // Filter by location
    if (location && location !== 'all' && location.trim() !== '') {
      query += ` AND c.location LIKE ?`;
      params.push(`%${location.trim()}%`);
    }

    query += ` GROUP BY d.id ORDER BY d.id ASC`;

    const [doctorRows] = await pool.query(query, params);

    // Compute current day of week (Sat, Sun, Mon, Tue, Wed, Thu, Fri)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[new Date().getDay()];

    // Fetch chambers and availability for each doctor
    const fullDoctors = await Promise.all(
      doctorRows.map(async (doc) => {
        const [chambers] = await pool.query(
          `SELECT id, location, address, fees FROM chambers WHERE doctor_id = ?`,
          [doc.id]
        );

        const [availList] = await pool.query(
          `SELECT id, day_of_week, start_time, end_time FROM availability WHERE doctor_id = ?`,
          [doc.id]
        );

        // Check if doctor is available today
        const isAvailableToday = availList.some(
          (a) => a.day_of_week.toLowerCase() === currentDay.toLowerCase()
        );

        // Check if available on weekend (Sat or Sun in Bangladesh)
        const isWeekend = availList.some(
          (a) => ['sat', 'sun'].includes(a.day_of_week.toLowerCase())
        );

        // Unique formatted days string
        const uniqueDays = [...new Set(availList.map((a) => a.day_of_week))].join(', ');

        // Primary chamber
        const primaryChamber = chambers[0] || {
          location: 'Dinajpur Sadar',
          address: 'Dinajpur Medical Chamber',
          fees: 500
        };

        return {
          ...doc,
          fees: primaryChamber.fees,
          hospital: primaryChamber.address,
          location: primaryChamber.location,
          chambers: chambers,
          available_days: uniqueDays || 'Saturday – Thursday',
          available_today: isAvailableToday,
          available_weekend: isWeekend,
          availability: availList
        };
      })
    );

    return res.status(200).json({ success: true, count: fullDoctors.length, doctors: fullDoctors });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching doctors.' });
  }
});

// -------------------------------------------------------------
// GET /api/doctors/:id
// Get doctor profile, chambers, availability
// -------------------------------------------------------------
app.get('/api/doctors/:id', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
    }

    const [doctors] = await pool.query('SELECT * FROM doctors WHERE id = ?', [doctorId]);
    if (doctors.length === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    const doctor = doctors[0];
    const [chambers] = await pool.query('SELECT * FROM chambers WHERE doctor_id = ?', [doctorId]);
    const [availability] = await pool.query('SELECT * FROM availability WHERE doctor_id = ?', [doctorId]);

    return res.status(200).json({
      success: true,
      doctor: {
        ...doctor,
        chambers,
        availability
      }
    });
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching doctor profile.' });
  }
});

// -------------------------------------------------------------
// GET /api/doctors/:id/slots
// Generate and return available slots for a given date
// Prevents double-booking by filtering out existing appointments
// -------------------------------------------------------------
app.get('/api/doctors/:id/slots', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    const { date } = req.query; // YYYY-MM-DD format

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
    }

    const selectedDate = date ? new Date(date) : new Date();
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const formattedDate = selectedDate.toISOString().split('T')[0];

    // Get day name
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = dayNames[selectedDate.getDay()];

    // Check doctor availability for this day
    const [availRows] = await pool.query(
      `SELECT * FROM availability WHERE doctor_id = ? AND day_of_week = ?`,
      [doctorId, dayOfWeek]
    );

    if (availRows.length === 0) {
      return res.status(200).json({
        success: true,
        date: formattedDate,
        dayOfWeek: dayOfWeek,
        available: false,
        message: `Doctor is not available on ${dayOfWeek}.`,
        slots: []
      });
    }

    // Default template slots if start/end times exist
    // E.g., for 16:00:00 to 20:00:00 -> 4:00 PM, 5:00 PM, 6:00 PM, 7:00 PM
    const templateSlots = [
      { time: '09:00:00', label: '9:00 AM' },
      { time: '10:00:00', label: '10:00 AM' },
      { time: '11:00:00', label: '11:00 AM' },
      { time: '11:30:00', label: '11:30 AM' },
      { time: '16:00:00', label: '4:00 PM' },
      { time: '17:00:00', label: '5:00 PM' },
      { time: '18:00:00', label: '6:00 PM' },
      { time: '19:00:00', label: '7:00 PM' }
    ];

    // Find slots within the doctor's available hours
    const validSlots = templateSlots.filter((slot) => {
      return availRows.some((avail) => {
        return slot.time >= avail.start_time && slot.time < avail.end_time;
      });
    });

    // Fallback: If no template slot fell strictly within range, generate hourly slots from start_time to end_time
    let candidateSlots = validSlots;
    if (candidateSlots.length === 0 && availRows.length > 0) {
      const avail = availRows[0];
      const startH = parseInt(avail.start_time.split(':')[0]);
      const endH = parseInt(avail.end_time.split(':')[0]);
      for (let h = startH; h < endH; h++) {
        const hStr = h.toString().padStart(2, '0') + ':00:00';
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        candidateSlots.push({
          time: hStr,
          label: `${displayH}:00 ${period}`
        });
      }
    }

    // Fetch existing appointments for this doctor on this date (not cancelled)
    const [existingAppts] = await pool.query(
      `SELECT appointment_time, COUNT(*) as booked_count FROM appointments 
       WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'
       GROUP BY appointment_time`,
      [doctorId, formattedDate]
    );

    const bookedCountMap = {};
    existingAppts.forEach((a) => {
      bookedCountMap[a.appointment_time] = parseInt(a.booked_count) || 0;
    });

    const MAX_CAPACITY = 3;

    // Construct slot list showing booked status and remaining capacity
    const slots = candidateSlots.map((s) => {
      const booked = bookedCountMap[s.time] || 0;
      const remaining = Math.max(0, MAX_CAPACITY - booked);
      const isFull = remaining === 0;
      return {
        time: s.label,
        raw_time: s.time,
        full: isFull,
        seats: remaining
      };
    });

    return res.status(200).json({
      success: true,
      date: formattedDate,
      dayOfWeek: dayOfWeek,
      available: true,
      slots: slots
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching available slots.' });
  }
});

// -------------------------------------------------------------
// POST /api/appointments
// Create a new appointment
// Authenticated patients only
// Double booking prevention enforced
// -------------------------------------------------------------
app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, reason } = req.body;
    const patient_id = req.user.id;

    // Validation
    if (!doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, appointment date, and time slot are required.'
      });
    }

    // Check doctor exists and is approved
    const [doctors] = await pool.query('SELECT id, name FROM doctors WHERE id = ? AND approval_status = \'approved\'', [doctor_id]);
    if (doctors.length === 0) {
      return res.status(404).json({ success: false, message: 'Selected doctor not found or not available for appointments.' });
    }

    // Convert display time or standard time to HH:MM:00
    let formattedTime = appointment_time;
    if (appointment_time.includes('AM') || appointment_time.includes('PM')) {
      const parts = appointment_time.trim().split(' ');
      const timeParts = parts[0].split(':');
      let hours = parseInt(timeParts[0]);
      const minutes = timeParts[1] || '00';
      const modifier = parts[1].toUpperCase();

      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`;
    }

    // Validate date format
    const parsedDate = new Date(appointment_date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid appointment date format.' });
    }
    const formattedDate = parsedDate.toISOString().split('T')[0];

    // PREVENT CAPACITY OVERFLOW: Check active (non-cancelled) bookings for this doctor, date & time
    const MAX_CAPACITY = 3;
    const [existing] = await pool.query(
      `SELECT COUNT(*) as active_count FROM appointments 
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'`,
      [doctor_id, formattedDate, formattedTime]
    );

    const activeBookings = parseInt(existing[0]?.active_count) || 0;
    if (activeBookings >= MAX_CAPACITY) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is fully booked (maximum 3 patients). Please choose a different slot or date.'
      });
    }

    // Insert new appointment (default status: pending)
    const [insertResult] = await pool.query(
      `INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [doctor_id, patient_id, formattedDate, formattedTime, reason || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully! Status is pending doctor confirmation.',
      appointment: {
        id: insertResult.insertId,
        doctor_id,
        doctor_name: doctors[0].name,
        patient_id,
        appointment_date: formattedDate,
        appointment_time: formattedTime,
        reason: reason || null,
        status: 'pending'
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'This time slot has just been booked. Please choose another slot.'
      });
    }
    console.error('Error creating appointment:', error);
    return res.status(500).json({ success: false, message: 'Server error creating appointment.' });
  }
});

// -------------------------------------------------------------
// POST /api/appointments/emergency
// Create an emergency appointment request
// Authenticated patients only
// Persisted in MySQL appointments table
// -------------------------------------------------------------
app.post('/api/appointments/emergency', requireAuth, async (req, res) => {
  try {
    const { doctor_id, description, location, contact_name, contact_phone } = req.body;
    const patient_id = req.user.id;

    if (!doctor_id) {
      return res.status(400).json({ success: false, message: 'Doctor ID is required.' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Please describe the emergency situation.' });
    }

    // Verify doctor exists and is approved
    const [doctors] = await pool.query('SELECT id, name FROM doctors WHERE id = ? AND approval_status = \'approved\'', [doctor_id]);
    if (doctors.length === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found or not available for appointments.' });
    }

    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    // Ensure unique time slot for immediate insertion without conflicting with scheduled slots
    let formattedTime = today.toTimeString().split(' ')[0]; // HH:MM:SS
    
    // Format reason with contact details if provided
    let reasonText = `[EMERGENCY] ${description.trim()}`;
    if (contact_name || contact_phone) {
      reasonText += ` | Contact: ${contact_name || ''} (${contact_phone || ''})`;
    }

    // Retry slot with slight second offset in case of rare collision on the same second
    let inserted = false;
    let insertResult;
    let attempts = 0;

    while (!inserted && attempts < 5) {
      try {
        const [resQuery] = await pool.query(
          `INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, reason, status, is_emergency, emergency_location)
           VALUES (?, ?, ?, ?, ?, 'pending', 1, ?)`,
          [doctor_id, patient_id, formattedDate, formattedTime, reasonText, location || null]
        );
        insertResult = resQuery;
        inserted = true;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          // adjust seconds
          const offsetDate = new Date(Date.now() + (attempts + 1) * 1000);
          formattedTime = offsetDate.toTimeString().split(' ')[0];
          attempts++;
        } else {
          throw err;
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Emergency request sent! The doctor has been notified.',
      appointment: {
        id: insertResult.insertId,
        doctor_id,
        doctor_name: doctors[0].name,
        patient_id,
        appointment_date: formattedDate,
        appointment_time: formattedTime,
        reason: reasonText,
        is_emergency: 1,
        emergency_location: location || null,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Error creating emergency appointment:', error);
    return res.status(500).json({ success: false, message: 'Server error creating emergency request.' });
  }
});

// -------------------------------------------------------------
// GET /api/patient/appointments
// Retrieve appointments for the logged-in patient
// -------------------------------------------------------------
app.get('/api/patient/appointments', requireAuth, async (req, res) => {
  try {
    const patient_id = req.user.id;

    const [rows] = await pool.query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.reason,
        a.status,
        a.is_emergency,
        a.emergency_location,
        a.created_at,
        d.id as doctor_id,
        d.name as doctor_name,
        d.specialty as doctor_specialty,
        (SELECT location FROM chambers WHERE doctor_id = d.id LIMIT 1) as chamber_location,
        (SELECT address FROM chambers WHERE doctor_id = d.id LIMIT 1) as chamber_address,
        (SELECT fees FROM chambers WHERE doctor_id = d.id LIMIT 1) as consultation_fee
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patient_id]
    );

    return res.status(200).json({ success: true, appointments: rows });
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching appointments.' });
  }
});

// -------------------------------------------------------------
// GET /api/doctor/appointments
// Retrieve appointments for the logged-in doctor
// -------------------------------------------------------------
app.get('/api/doctor/appointments', requireAuth, async (req, res) => {
  try {
    // Look up doctor_id from user_id
    const [docs] = await pool.query('SELECT id, name FROM doctors WHERE user_id = ?', [req.user.id]);
    if (docs.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have a doctor profile.' });
    }

    const doctorId = docs[0].id;

    const [rows] = await pool.query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.reason,
        a.status,
        a.is_emergency,
        a.emergency_location,
        a.created_at,
        u.first_name as patient_first_name,
        u.last_name as patient_last_name,
        u.phone as patient_phone,
        u.email as patient_email
       FROM appointments a
       JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      doctor_name: docs[0].name,
      appointments: rows
    });
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching appointments.' });
  }
});

// -------------------------------------------------------------
// PATCH /api/appointments/:id/status
// Update appointment status: confirmed, completed, cancelled
// Doctors can confirm/complete/cancel their appointments
// Patients can cancel their own appointments
// -------------------------------------------------------------
app.patch('/api/appointments/:id/status', requireAuth, async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment status.' });
    }

    const [appointments] = await pool.query(
      'SELECT a.*, d.user_id as doctor_user_id FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE a.id = ?',
      [appointmentId]
    );

    if (appointments.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const appt = appointments[0];

    // Authorization check:
    // Doctor can update status if they own the appointment
    // Patient can cancel their own appointment
    const isDoctorOwner = req.user.role === 'doctor' && req.user.id === appt.doctor_user_id;
    const isPatientOwner = req.user.id === appt.patient_id;

    if (!isDoctorOwner && !(isPatientOwner && status === 'cancelled')) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. You do not have permission to modify this appointment.'
      });
    }

    // Status transition validation
    if (appt.status === 'completed' && status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot change status of a completed appointment.' });
    }
    if (appt.status === 'cancelled' && status !== 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot modify a cancelled appointment.' });
    }

    await pool.query('UPDATE appointments SET status = ? WHERE id = ?', [status, appointmentId]);

    return res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}.`,
      appointmentId,
      status
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    return res.status(500).json({ success: false, message: 'Server error updating status.' });
  }
});

// -------------------------------------------------------------
// GET /api/chambers
// Get chambers for a doctor
// -------------------------------------------------------------
app.get('/api/doctors/:id/chambers', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    const [chambers] = await pool.query('SELECT * FROM chambers WHERE doctor_id = ?', [doctorId]);
    return res.status(200).json({ success: true, chambers });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching chambers.' });
  }
});

// -------------------------------------------------------------
// POST /api/doctors/:id/chambers
// Add a new chamber for a doctor
// -------------------------------------------------------------
app.post('/api/doctors/:id/chambers', requireAuth, async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    const { location, address, fees } = req.body;

    const [docs] = await pool.query('SELECT user_id FROM doctors WHERE id = ?', [doctorId]);
    if (docs.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    if (docs[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized to add chamber for this doctor.' });
    }

    if (!location || !address) {
      return res.status(400).json({ success: false, message: 'Location and address are required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO chambers (doctor_id, location, address, fees) VALUES (?, ?, ?, ?)',
      [doctorId, location.trim(), address.trim(), fees || 500.00]
    );

    return res.status(201).json({ success: true, message: 'Chamber added successfully!', id: result.insertId });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error adding chamber.' });
  }
});

// -------------------------------------------------------------
// GET /api/doctors/:id/availability
// Get availability rules for a doctor
// -------------------------------------------------------------
app.get('/api/doctors/:id/availability', async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    const [availability] = await pool.query('SELECT * FROM availability WHERE doctor_id = ?', [doctorId]);
    return res.status(200).json({ success: true, availability });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching availability.' });
  }
});

// -------------------------------------------------------------
// ADMIN DASHBOARD APIS (Protected by requireAuth + requireAdmin)
// -------------------------------------------------------------

// 1. GET /api/admin/summary
// Summary counters: total patients, total doctors, total appointments, pending doctor approvals
app.get('/api/admin/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [[{ total_patients }]] = await pool.query(
      `SELECT COUNT(*) as total_patients FROM users WHERE role = 'patient'`
    );
    const [[{ total_doctors }]] = await pool.query(
      `SELECT COUNT(*) as total_doctors FROM doctors`
    );
    const [[{ total_appointments }]] = await pool.query(
      `SELECT COUNT(*) as total_appointments FROM appointments`
    );
    const [[{ pending_doctors }]] = await pool.query(
      `SELECT COUNT(*) as pending_doctors FROM doctors WHERE approval_status = 'pending'`
    );

    return res.status(200).json({
      success: true,
      summary: {
        total_patients: total_patients || 0,
        total_doctors: total_doctors || 0,
        total_appointments: total_appointments || 0,
        pending_doctors: pending_doctors || 0
      }
    });
  } catch (error) {
    console.error('Admin summary error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching admin summary.' });
  }
});

// 2. GET /api/admin/doctors
// List all doctors with their approval status, BMDC reg no, user details
app.get('/api/admin/doctors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        d.id,
        d.user_id,
        d.name,
        d.specialty,
        d.degree,
        d.bmdc_reg_no,
        d.approval_status,
        d.created_at,
        u.email,
        u.phone,
        (SELECT COUNT(*) FROM appointments WHERE doctor_id = d.id) as appointment_count
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.id DESC
    `);
    return res.status(200).json({ success: true, doctors: rows });
  } catch (error) {
    console.error('Admin doctors list error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching doctors.' });
  }
});

// 3. PATCH /api/admin/doctors/:id/approval
// Update doctor approval status: approved or rejected
app.patch('/api/admin/doctors/:id/approval', requireAuth, requireAdmin, async (req, res) => {
  try {
    const doctorId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid approval status.' });
    }

    const [result] = await pool.query(
      `UPDATE doctors SET approval_status = ? WHERE id = ?`,
      [status, doctorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Doctor record not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Doctor status updated to ${status}.`
    });
  } catch (error) {
    console.error('Admin doctor approval error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating doctor status.' });
  }
});

// 4. GET /api/admin/users
// Basic user list of patients and doctors
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.query;
    let query = `
      SELECT id, first_name, last_name, phone, email, gender, role, created_at 
      FROM users 
      WHERE role IN ('patient', 'doctor')
    `;
    const params = [];
    if (role && ['patient', 'doctor'].includes(role)) {
      query += ` AND role = ?`;
      params.push(role);
    }
    query += ` ORDER BY id DESC`;

    const [rows] = await pool.query(query, params);
    return res.status(200).json({ success: true, users: rows });
  } catch (error) {
    console.error('Admin users list error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching users.' });
  }
});

// 5. GET /api/admin/appointments
// All appointments showing patient, doctor, date/time, status, and emergency flag
app.get('/api/admin/appointments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.reason,
        a.status,
        a.is_emergency,
        a.emergency_location,
        a.created_at,
        d.id as doctor_id,
        d.name as doctor_name,
        d.specialty as doctor_specialty,
        u.id as patient_id,
        u.first_name as patient_first_name,
        u.last_name as patient_last_name,
        u.phone as patient_phone,
        u.email as patient_email
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON a.patient_id = u.id
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `);
    return res.status(200).json({ success: true, appointments: rows });
  } catch (error) {
    console.error('Admin appointments list error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching appointments.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`DoctorFinder Server running on http://localhost:${PORT}`);
});
