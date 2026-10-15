const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'doctor_finder_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Set DB_SSL=true in .env when connecting to a cloud MySQL provider that requires SSL
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

async function initDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();

    // 1. users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        gender VARCHAR(20) DEFAULT NULL,
        date_of_birth DATE DEFAULT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('patient', 'doctor') NOT NULL,
        specialty VARCHAR(100) DEFAULT NULL,
        bmdc_reg_no VARCHAR(100) DEFAULT NULL,
        consultation_fee DECIMAL(10, 2) DEFAULT NULL,
        chamber_name VARCHAR(255) DEFAULT NULL,
        chamber_address TEXT DEFAULT NULL,
        available_days VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. doctors table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        name VARCHAR(150) NOT NULL,
        specialty VARCHAR(100) NOT NULL,
        degree VARCHAR(150) DEFAULT 'MBBS',
        bmdc_reg_no VARCHAR(100) DEFAULT NULL,
        photo VARCHAR(255) DEFAULT NULL,
        bio TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. chambers table (supports multiple chambers per doctor)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chambers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctor_id INT NOT NULL,
        location VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        fees DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_chambers_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. availability table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS availability (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctor_id INT NOT NULL,
        day_of_week VARCHAR(20) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_avail_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. appointments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctor_id INT NOT NULL,
        patient_id INT NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        reason TEXT DEFAULT NULL,
        status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no-show') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_doctor_date_time (doctor_id, appointment_date, appointment_time),
        INDEX idx_doctor (doctor_id),
        INDEX idx_patient (patient_id),
        INDEX idx_date (appointment_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Safely ensure appointments.status ENUM includes 'no-show' idempotently
    try {
      const [colInfo] = await connection.query(`
        SELECT COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'appointments' 
          AND COLUMN_NAME = 'status'
      `);
      if (colInfo.length > 0 && !colInfo[0].COLUMN_TYPE.includes("'no-show'")) {
        await connection.query(`
          ALTER TABLE appointments 
          MODIFY COLUMN status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no-show') NOT NULL DEFAULT 'pending'
        `);
      }
    } catch (e) {
      // Ignore if schema check or alter encounters permission or structure issue
    }

    // Safely remove unique constraint to allow up to 3 patients per hour slot
    try {
      await connection.query(`ALTER TABLE appointments DROP INDEX uq_doc_date_time`);
    } catch (e) {
      // Ignore if index already dropped or does not exist
    }

    // Ensure non-unique lookup index exists on (doctor_id, appointment_date, appointment_time)
    try {
      await connection.query(`ALTER TABLE appointments ADD INDEX idx_doctor_date_time (doctor_id, appointment_date, appointment_time)`);
    } catch (e) {
      // Ignore if index already exists
    }

    // Ensure is_emergency and emergency_location columns exist on appointments
    try {
      await connection.query(`ALTER TABLE appointments ADD COLUMN is_emergency TINYINT(1) NOT NULL DEFAULT 0`);
    } catch (e) {
      // Column might already exist
    }
    try {
      await connection.query(`ALTER TABLE appointments ADD COLUMN emergency_location VARCHAR(255) DEFAULT NULL`);
    } catch (e) {
      // Column might already exist
    }

    // 6. password_resets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_id (user_id),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. medical_records table (Patient Medical Vault)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medical_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        record_type ENUM('report', 'previous_prescription') NOT NULL,
        title VARCHAR(255) NOT NULL,
        doctor_or_lab VARCHAR(255) DEFAULT NULL,
        record_date DATE NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename VARCHAR(255) NOT NULL UNIQUE,
        mime_type VARCHAR(100) NOT NULL,
        file_size_bytes INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_mr_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_mr_patient_created (patient_id, created_at),
        INDEX idx_mr_type (record_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. appointment_record_access table (Patient-Controlled Doctor Access with Snapshot Cutoff)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS appointment_record_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL UNIQUE,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        grant_access TINYINT(1) NOT NULL DEFAULT 1,
        granted_at_cutoff TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ara_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_ara_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ara_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        INDEX idx_ara_doctor_lookup (doctor_id, appointment_id, revoked)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. prescriptions table (Doctor-Written Consultations)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL UNIQUE,
        doctor_id INT NOT NULL,
        patient_id INT NOT NULL,
        symptoms TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        medicines JSON NOT NULL,
        advice TEXT DEFAULT NULL,
        follow_up VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_rx_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_rx_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
        CONSTRAINT fk_rx_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_rx_patient (patient_id),
        INDEX idx_rx_doctor (doctor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure users table role ENUM includes 'admin'
    try {
      await connection.query(`ALTER TABLE users MODIFY COLUMN role ENUM('patient', 'doctor', 'admin') NOT NULL`);
    } catch (e) {
      // Ignore if already modified or unchanged
    }

    // Ensure doctors table has approval_status column ('pending', 'approved', 'rejected')
    try {
      await connection.query(`ALTER TABLE doctors ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved'`);
    } catch (e) {
      // Column might already exist
    }

    // Seed default admin account if not present
    const [adminCheck] = await connection.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (adminCheck.length === 0) {
      const bcrypt = require('bcryptjs');
      const adminPassHash = await bcrypt.hash('admin123', 10);
      await connection.query(
        `INSERT INTO users (first_name, last_name, phone, email, password_hash, role)
         VALUES (?, ?, ?, ?, ?, 'admin')`,
        ['System', 'Admin', '01700000000', 'admin@doctorfinder.com', adminPassHash]
      );
      console.log('Default admin seeded: admin@doctorfinder.com / admin123');
    }

    // 7. Migrate existing doctor records from users into doctors, chambers, and availability if not already migrated
    const [existingDoctorUsers] = await connection.query(
      `SELECT * FROM users WHERE role = 'doctor'`
    );

    for (const docUser of existingDoctorUsers) {
      const [existingDoc] = await connection.query(
        `SELECT id FROM doctors WHERE user_id = ?`,
        [docUser.id]
      );

      let docId;
      if (existingDoc.length === 0) {
        const docName = `Dr. ${docUser.first_name} ${docUser.last_name}`;
        const [insertRes] = await connection.query(
          `INSERT INTO doctors (user_id, name, specialty, degree, bmdc_reg_no, bio)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            docUser.id,
            docName,
            docUser.specialty || 'General Physician',
            'MBBS, FCPS',
            docUser.bmdc_reg_no || 'BMDC-REG',
            `Experienced specialist doctor serving patients with dedicated healthcare.`
          ]
        );
        docId = insertRes.insertId;
      } else {
        docId = existingDoc[0].id;
      }

      // Chamber migration if chamber info exists
      const [existingChambers] = await connection.query(
        `SELECT id FROM chambers WHERE doctor_id = ?`,
        [docId]
      );

      if (existingChambers.length === 0) {
        const chamberName = docUser.chamber_name || 'Dinajpur Medical Chamber';
        const address = docUser.chamber_address || 'Dinajpur Sadar';
        const fee = docUser.consultation_fee || 500;
        await connection.query(
          `INSERT INTO chambers (doctor_id, location, address, fees)
           VALUES (?, ?, ?, ?)`,
          [docId, 'Sadar', `${chamberName}, ${address}`, fee]
        );
      }

      // Availability migration if available_days exists
      const [existingAvail] = await connection.query(
        `SELECT id FROM availability WHERE doctor_id = ?`,
        [docId]
      );

      if (existingAvail.length === 0) {
        let days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
        if (docUser.available_days) {
          days = docUser.available_days.split(',').map(d => d.trim()).filter(Boolean);
        }
        for (const day of days) {
          await connection.query(
            `INSERT INTO availability (doctor_id, day_of_week, start_time, end_time)
             VALUES (?, ?, '16:00:00', '20:00:00')`,
            [docId, day]
          );
        }
      }
    }

    // 7. Seed sample doctors if database has fewer than 4 doctors so DoctorFinder looks rich and matches initial data
    const [totalDocs] = await connection.query(`SELECT COUNT(*) as c FROM doctors`);
    if (totalDocs[0].c < 4) {
      const sampleSeed = [
        {
          email: 'seed.rahim@doctorfinder.com',
          first: 'Rahim',
          last: 'Uddin',
          phone: '01711000001',
          specialty: 'Cardiologist',
          degree: 'MBBS, MD (Cardiology)',
          bmdc: 'A-12345',
          bio: 'Dr. Rahim Uddin is a cardiologist with over 10 years of experience treating heart-related conditions. He completed his MBBS from Rajshahi Medical College.',
          chambers: [
            { location: 'Sadar', address: 'Dinajpur Medical Chamber, Sadar', fees: 500 }
          ],
          days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']
        },
        {
          email: 'seed.sadia@doctorfinder.com',
          first: 'Sadia',
          last: 'Islam',
          phone: '01711000002',
          specialty: 'Pediatrician',
          degree: 'MBBS, DCH, FCPS (Pediatrics)',
          bmdc: 'A-23456',
          bio: 'Dr. Sadia Islam is a pediatrician dedicated to child health. She is known for her gentle approach with young patients and thorough examinations.',
          chambers: [
            { location: 'Sadar', address: 'City Health Center, Sadar Hospital Road', fees: 400 }
          ],
          days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']
        },
        {
          email: 'seed.kamal@doctorfinder.com',
          first: 'Kamal',
          last: 'Hossain',
          phone: '01711000003',
          specialty: 'Dermatologist',
          degree: 'MBBS, DDV',
          bmdc: 'A-34567',
          bio: 'Dr. Kamal Hossain specializes in skin, hair, and nail disorders. He has been serving patients in Dinajpur for 7 years.',
          chambers: [
            { location: 'Birampur', address: 'Green Life Clinic, Birampur Main Road', fees: 600 }
          ],
          days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed']
        },
        {
          email: 'seed.mimuna@doctorfinder.com',
          first: 'Mimuna',
          last: 'Parvin',
          phone: '01711000004',
          specialty: 'Gynecologist',
          degree: 'MBBS, DGO, FCPS (Obs & Gynae)',
          bmdc: 'A-45678',
          bio: 'Dr. Mimuna Parvin is a trusted gynecologist and obstetrician with 12 years of experience. She is highly regarded for her patient-centered care.',
          chambers: [
            { location: 'Parbatipur', address: 'Sadar Hospital Road, Parbatipur', fees: 500 },
            { location: 'Sadar', address: 'Central Diagnostic Care, Dinajpur Sadar', fees: 700 }
          ],
          days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']
        }
      ];

      for (const s of sampleSeed) {
        const [u] = await connection.query(`SELECT id FROM users WHERE email = ?`, [s.email]);
        let uid;
        if (u.length === 0) {
          const dummyHash = '$2b$10$BAKVDdiA9gKoNHcs27eoQ.aMOU/kP5.c9pgseWd3TP3EZ20spyd2y'; // password123
          const [insUser] = await connection.query(
            `INSERT INTO users (first_name, last_name, phone, email, password_hash, role)
             VALUES (?, ?, ?, ?, ?, 'doctor')`,
            [s.first, s.last, s.phone, s.email, dummyHash]
          );
          uid = insUser.insertId;
        } else {
          uid = u[0].id;
        }

        const [d] = await connection.query(`SELECT id FROM doctors WHERE user_id = ?`, [uid]);
        let did;
        if (d.length === 0) {
          const [insDoc] = await connection.query(
            `INSERT INTO doctors (user_id, name, specialty, degree, bmdc_reg_no, bio)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uid, `Dr. ${s.first} ${s.last}`, s.specialty, s.degree, s.bmdc, s.bio]
          );
          did = insDoc.insertId;
        } else {
          did = d[0].id;
        }

        for (const ch of s.chambers) {
          const [exCh] = await connection.query(
            `SELECT id FROM chambers WHERE doctor_id = ? AND location = ?`,
            [did, ch.location]
          );
          if (exCh.length === 0) {
            await connection.query(
              `INSERT INTO chambers (doctor_id, location, address, fees) VALUES (?, ?, ?, ?)`,
              [did, ch.location, ch.address, ch.fees]
            );
          }
        }

        for (const day of s.days) {
          const [exAv] = await connection.query(
            `SELECT id FROM availability WHERE doctor_id = ? AND day_of_week = ?`,
            [did, day]
          );
          if (exAv.length === 0) {
            await connection.query(
              `INSERT INTO availability (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, '16:00:00', '20:00:00')`,
              [did, day]
            );
          }
        }
      }
    }

    console.log('MySQL Database & All Tables initialized successfully.');
  } catch (error) {
    console.error('Database initialization error:', error.message);
  } finally {
    if (connection) connection.release();
  }
}

initDatabase();

module.exports = pool;
