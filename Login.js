// ===== API CONFIGURATION =====
// For cloud deployment, set window.CLOUD_API_URL in config.js (loaded before this file).
// For local development, leave config.js empty — auto-detection below handles it.
const API_BASE_URL = window.CLOUD_API_URL || ((window.location.port !== '5000') ? 'http://localhost:5000' : '');

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
  if (roleParam && (roleParam === 'patient' || roleParam === 'doctor' || roleParam === 'admin')) {
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
      if (data.user.role === 'admin') {
        window.location.href = 'admin.html';
      } else if (data.user.role === 'doctor') {
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

// ===== FORGOT PASSWORD & RESET MODAL LOGIC =====
let activeResetToken = null;

function openForgotModal() {
  const modal = document.getElementById('forgotModal');
  const errorBox = document.getElementById('forgotError');
  const successBox = document.getElementById('forgotSuccess');
  if (errorBox) errorBox.style.display = 'none';
  if (successBox) successBox.style.display = 'none';

  // If user entered email on login form, pre-fill it
  const loginEmail = document.getElementById('loginEmail');
  const forgotEmail = document.getElementById('forgotEmail');
  if (loginEmail && forgotEmail && !forgotEmail.value) {
    forgotEmail.value = loginEmail.value.trim();
  }

  if (modal) modal.classList.add('open');
}

function closeForgotModal() {
  const modal = document.getElementById('forgotModal');
  if (modal) modal.classList.remove('open');
}

function openResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.add('open');
}

function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('open');
}

// Attach listener to forgot password link
const forgotLink = document.getElementById('forgotPasswordLink') || document.querySelector('.forgot-link');
if (forgotLink) {
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    openForgotModal();
  });
}

// Close modals when clicking outside
const forgotModalOverlay = document.getElementById('forgotModal');
if (forgotModalOverlay) {
  forgotModalOverlay.addEventListener('click', function(e) {
    if (e.target === this) closeForgotModal();
  });
}

const resetModalOverlay = document.getElementById('resetModal');
if (resetModalOverlay) {
  resetModalOverlay.addEventListener('click', function(e) {
    if (e.target === this) closeResetModal();
  });
}

// Check URL for ?token= on load
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    activeResetToken = token;
    // Verify token with backend
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || 'Invalid or expired password reset link.', 'error');
        const loginErrorBox = document.getElementById('loginError');
        const loginErrorMsg = document.getElementById('loginErrorMsg');
        if (loginErrorBox && loginErrorMsg) {
          loginErrorMsg.textContent = data.message || 'Password reset link is invalid or expired. Please request a new one.';
          loginErrorBox.style.display = 'flex';
        }
      } else {
        const subtitle = document.getElementById('resetSubtitle');
        if (subtitle && data.email) {
          subtitle.innerHTML = `Resetting password for <strong>${data.email}</strong> (${data.role})`;
        }
        openResetModal();
      }
    } catch (err) {
      console.error('Error verifying token:', err);
    }
  }
});

// Handle Forgot Password submission
async function handleForgotPassword(event) {
  event.preventDefault();

  const emailInput = document.getElementById('forgotEmail');
  const errorBox = document.getElementById('forgotError');
  const errorMsg = document.getElementById('forgotErrorMsg');
  const successBox = document.getElementById('forgotSuccess');
  const successMsg = document.getElementById('forgotSuccessMsg');
  const btn = document.getElementById('forgotBtn');

  const email = emailInput ? emailInput.value.trim() : '';

  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!email) {
    errorMsg.textContent = 'Please enter your registered email address.';
    errorBox.style.display = 'flex';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      errorMsg.textContent = data.message || 'Unable to process request. Please try again.';
      errorBox.style.display = 'flex';
      return;
    }

    successMsg.textContent = data.message;
    successBox.style.display = 'flex';

    if (emailInput) emailInput.value = '';

    setTimeout(() => {
      closeForgotModal();
    }, 4000);

  } catch (err) {
    console.error('Forgot password error:', err);
    errorMsg.textContent = 'Unable to connect to server. Please try again.';
    errorBox.style.display = 'flex';
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.innerHTML = '<span>Send Reset Link</span><i class="fa-solid fa-paper-plane"></i>';
  }
}

// Handle Reset Password submission
async function handleResetPassword(event) {
  event.preventDefault();

  const newPassInput = document.getElementById('newPassword');
  const confirmPassInput = document.getElementById('confirmNewPassword');
  const errorBox = document.getElementById('resetError');
  const errorMsg = document.getElementById('resetErrorMsg');
  const successBox = document.getElementById('resetSuccess');
  const successMsg = document.getElementById('resetSuccessMsg');
  const btn = document.getElementById('resetBtn');

  const newPassword = newPassInput ? newPassInput.value : '';
  const confirmPassword = confirmPassInput ? confirmPassInput.value : '';

  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!activeResetToken) {
    errorMsg.textContent = 'Invalid or missing reset token.';
    errorBox.style.display = 'flex';
    return;
  }

  if (newPassword.length < 6) {
    errorMsg.textContent = 'Password must be at least 6 characters.';
    errorBox.style.display = 'flex';
    return;
  }

  if (newPassword !== confirmPassword) {
    errorMsg.textContent = 'Passwords do not match.';
    errorBox.style.display = 'flex';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: activeResetToken,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      errorMsg.textContent = data.message || 'Password reset failed.';
      errorBox.style.display = 'flex';
      return;
    }

    successMsg.textContent = data.message;
    successBox.style.display = 'flex';
    showToast('Password updated! You can now log in.');

    // Remove token from query parameters without reload
    window.history.replaceState({}, document.title, window.location.pathname);
    activeResetToken = null;

    setTimeout(() => {
      closeResetModal();
      const loginPassword = document.getElementById('loginPassword');
      if (loginPassword) loginPassword.focus();
    }, 2000);

  } catch (err) {
    console.error('Reset password error:', err);
    errorMsg.textContent = 'Unable to connect to server. Please try again.';
    errorBox.style.display = 'flex';
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.innerHTML = '<span>Update Password</span><i class="fa-solid fa-check"></i>';
  }
}