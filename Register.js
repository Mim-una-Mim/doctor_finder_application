// ===== API CONFIGURATION =====
// Automatically uses port 5000 if opened through VS Code Live Server or another dev server
const API_BASE_URL = (window.location.port !== '5000') ? 'http://localhost:5000' : '';

// ===== ROLE SWITCHING =====
let currentRole = 'patient';

function setRole(role) {
  currentRole = role;

  // Update tab styles
  document.getElementById('tabPatient').classList.toggle('active', role === 'patient');
  document.getElementById('tabDoctor').classList.toggle('active', role === 'doctor');

  // Show correct form
  document.getElementById('patientForm').style.display = role === 'patient' ? 'flex' : 'none';
  document.getElementById('doctorForm').style.display  = role === 'doctor'  ? 'flex' : 'none';

  // Update hint
  const label = role === 'patient' ? 'Patient' : 'Doctor';
  document.getElementById('roleHint').innerHTML = `Registering as a <strong>${label}</strong>`;
}

// ===== TOGGLE PASSWORD VISIBILITY =====
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon  = btn.querySelector('i');

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

// ===== PASSWORD STRENGTH CHECKER =====
function checkStrength(password, fillId, labelId, strengthId) {
  const fill  = document.getElementById(fillId);
  const label = document.getElementById(labelId);
  const box   = document.getElementById(strengthId);

  if (!password) { box.style.display = 'none'; return; }
  box.style.display = 'flex';

  let score = 0;
  if (password.length >= 6)  score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { pct: '20%',  color: '#e74c3c', text: 'Very Weak',   textColor: '#e74c3c' },
    { pct: '40%',  color: '#e67e22', text: 'Weak',        textColor: '#e67e22' },
    { pct: '60%',  color: '#f1c40f', text: 'Fair',        textColor: '#b7950b' },
    { pct: '80%',  color: '#2ecc71', text: 'Strong',      textColor: '#27ae60' },
    { pct: '100%', color: '#27ae60', text: 'Very Strong', textColor: '#1e8449' },
  ];

  const level = levels[Math.min(score - 1, 4)] || levels[0];
  fill.style.width = level.pct;
  fill.style.backgroundColor = level.color;
  label.textContent = level.text;
  label.style.color = level.textColor;
}

// Attach strength checkers
document.getElementById('patientPassword').addEventListener('input', function () {
  checkStrength(this.value, 'patientStrengthFill', 'patientStrengthLabel', 'patientStrength');
});

document.getElementById('doctorPassword').addEventListener('input', function () {
  checkStrength(this.value, 'doctorStrengthFill', 'doctorStrengthLabel', 'doctorStrength');
});

// ===== HANDLE REGISTER =====
async function handleRegister(event, role) {
  event.preventDefault();

  const errorBoxId = role === 'patient' ? 'patientError' : 'doctorError';
  const errorMsgId = role === 'patient' ? 'patientErrorMsg' : 'doctorErrorMsg';
  const passwordId = role === 'patient' ? 'patientPassword' : 'doctorPassword';
  const confirmId  = role === 'patient' ? 'patientConfirm'  : 'doctorConfirm';
  const btnId      = role === 'patient' ? 'patientBtn' : 'doctorBtn';
  const btnLabel   = role === 'patient' ? 'Create Patient Account' : 'Create Doctor Account';

  const errorBox = document.getElementById(errorBoxId);
  const errorMsg = document.getElementById(errorMsgId);
  const password = document.getElementById(passwordId).value;
  const confirm  = document.getElementById(confirmId).value;
  const btn      = document.getElementById(btnId);

  // Hide previous error
  errorBox.style.display = 'none';

  // Validate passwords match
  if (password !== confirm) {
    errorMsg.textContent = 'Passwords do not match. Please try again.';
    errorBox.style.display = 'flex';
    return;
  }

  // Validate minimum length
  if (password.length < 6) {
    errorMsg.textContent = 'Password must be at least 6 characters.';
    errorBox.style.display = 'flex';
    return;
  }

  // Gather payload based on role
  let payload = { role, password };

  if (role === 'patient') {
    const firstName = document.getElementById('patientFirstName').value.trim();
    const lastName  = document.getElementById('patientLastName').value.trim();
    const email     = document.getElementById('patientEmail').value.trim();
    const phone     = document.getElementById('patientPhone').value.trim();
    const gender    = document.getElementById('patientGender').value;
    const dob       = document.getElementById('patientDob').value;

    if (!firstName || !lastName || !email || !phone) {
      errorMsg.textContent = 'Please fill in all required fields.';
      errorBox.style.display = 'flex';
      return;
    }

    payload = {
      ...payload,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      gender: gender,
      date_of_birth: dob
    };
  } else if (role === 'doctor') {
    const firstName = document.getElementById('doctorFirstName').value.trim();
    const lastName  = document.getElementById('doctorLastName').value.trim();
    const email     = document.getElementById('doctorEmail').value.trim();
    const phone     = document.getElementById('doctorPhone').value.trim();
    const specialty = document.getElementById('doctorSpecialty').value;
    const bmdc      = document.getElementById('doctorBmdc').value.trim();
    const fee       = document.getElementById('doctorFee').value;
    const chamber   = document.getElementById('doctorChamber').value.trim();
    const address   = document.getElementById('doctorAddress').value.trim();

    // Checked days
    const checkedDays = Array.from(document.querySelectorAll('input[name="doctorDays"]:checked')).map(cb => cb.value);

    if (!firstName || !lastName || !email || !phone || !specialty || !bmdc || !fee || !chamber || !address) {
      errorMsg.textContent = 'Please fill in all required fields.';
      errorBox.style.display = 'flex';
      return;
    }

    payload = {
      ...payload,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      specialty: specialty,
      bmdc_reg_no: bmdc,
      consultation_fee: fee,
      chamber_name: chamber,
      chamber_address: address,
      available_days: checkedDays
    };
  }

  // Loading state
  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      errorMsg.textContent = data.message || 'Registration failed. Please try again.';
      errorBox.style.display = 'flex';
      return;
    }

    // Success notification
    showToast(`${role === 'patient' ? 'Patient' : 'Doctor'} account created! Redirecting to login...`);

    setTimeout(() => {
      window.location.href = `login.html?role=${role}`;
    }, 1800);
  } catch (err) {
    console.error('Registration network error:', err);
    errorMsg.textContent = 'Unable to connect to server. Please check your connection.';
    errorBox.style.display = 'flex';
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.innerHTML = `<span>${btnLabel}</span><i class="fa-solid fa-arrow-right"></i>`;
  }
}

// ===== SOCIAL REGISTER =====
function socialRegister(provider) {
  showToast(`${provider} registration coming soon!`);
}

// ===== SHOW TOAST =====
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}