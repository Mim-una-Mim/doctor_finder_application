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
  queueLimit: 0
});

async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table
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

    connection.release();
    console.log('MySQL Database & Tables initialized successfully.');
  } catch (error) {
    console.error('Database initialization error:', error.message);
  }
}

initDatabase();

module.exports = pool;
