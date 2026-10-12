/**
 * config.js — Frontend API URL configuration
 *
 * LOCAL DEVELOPMENT:
 *   Leave CLOUD_API_URL as an empty string. The frontend JS files
 *   (Doctors.js, Login.js, Register.js, admin.js) will auto-detect
 *   port 5000 and use relative URLs.
 *
 * CLOUD DEPLOYMENT:
 *   Set CLOUD_API_URL to your deployed backend URL, e.g.:
 *     window.CLOUD_API_URL = 'https://doctor-finder.onrender.com';
 *   Then include this file BEFORE any other JS file in each HTML page.
 *   The frontend JS files read window.CLOUD_API_URL and use it instead
 *   of the localhost fallback.
 *
 * Do NOT commit a real cloud URL here. Keep this file set to '' for local dev.
 */
window.CLOUD_API_URL = ''; // Leave empty for local dev; set to cloud backend URL for deployment
