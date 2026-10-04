// ===== API CONFIGURATION =====
// Automatically uses port 5000 if opened through VS Code Live Server or another dev server
const API_BASE_URL = (window.location.port !== '5000') ? 'http://localhost:5000' : '';

// ===== ROLE SELECTION =====
let currentRole = 'patient';

function setRole(role, btn) {
  currentRole = role;

  // Update tab styles
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    // Find button with matching text
    document.querySelectorAll('.role-tab').forEach(t => {
      if (t.textContent.toLowerCase().includes(role)) {
        t.classList.add('active');
      }
    });
  }

  // Update hint text
  const hint = document.getElementById('roleHint');
  if (hint) {
    hint.innerHTML = `Logging in as a <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong>`;
  }
}

// Auto-select role if URL has ?role= query param
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get('role');
  if (roleParam && (roleParam === 'patient' || roleParam === 'doctor')) {
    setRole(roleParam);
  }
});

// ===== TOGGLE PASSWORD VISIBILITY =====
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// ===== HANDLE LOGIN =====
async function handleLogin(event) {
  event.preventDefault();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const errorBox = document.getElementById('loginError');
  const errorMsg = document.getElementById('loginErrorMsg');
  const btn = document.getElementById('loginBtn');

  // Hide old error
  errorBox.style.display = 'none';

  // Basic validation
  if (!email || !password) {
    errorMsg.textContent = 'Please fill in all fields.';
    errorBox.style.display = 'flex';
    return;
  }

  if (password.length < 6) {
    errorMsg.textContent = 'Password must be at least 6 characters.';
    errorBox.style.display = 'flex';
    return;
  }

  // Loading state
  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        role: currentRole
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      errorMsg.textContent = data.message || 'Invalid email or password.';
      errorBox.style.display = 'flex';
      return;
    }

    // Store auth info in localStorage and sessionStorage
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.setItem('role', data.user.role);

    // Show success toast
    showToast(`Welcome back, ${data.user.first_name}! Logged in as ${data.user.role}.`);

    // Redirect user to the appropriate page based on role
    setTimeout(() => {
      if (data.user.role === 'doctor') {
        window.location.href = 'doctors.html';
      } else {
        window.location.href = 'index.html';
      }
    }, 1500);

  } catch (err) {
    console.error('Login network error:', err);
    errorMsg.textContent = 'Unable to connect to server. Please try again.';
    errorBox.style.display = 'flex';
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.innerHTML = '<span>Log In</span><i class="fa-solid fa-arrow-right"></i>';
  }
}

// ===== SOCIAL LOGIN =====
function socialLogin(provider) {
  showToast(`${provider} login coming soon!`);
}

// ===== SHOW TOAST =====
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}