// Hero search — pressing Enter goes to doctors page
const heroSearch = document.getElementById('heroSearch');
if (heroSearch) {
  heroSearch.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      window.location.href = 'doctors.html';
    }
  });
}

// Global Auth State Handler for Navigation Bar
function initAuthNavbar() {
  const userJson = localStorage.getItem('user');
  if (!userJson) return;

  try {
    const user = JSON.parse(userJson);
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    const roleBadge = user.role === 'doctor' ? 'Dr.' : 'Patient';
    navActions.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:14px;font-weight:600;color:var(--navy);display:flex;align-items:center;gap:6px;">
          <i class="fa-solid ${user.role === 'doctor' ? 'fa-user-doctor' : 'fa-circle-user'}"></i>
          ${roleBadge} ${user.first_name}
        </span>
        <button id="logoutBtn" class="btn-outline" style="cursor:pointer;padding:7px 14px;font-size:13px;background:none;">
          <i class="fa-solid fa-right-from-bracket"></i> Log Out
        </button>
      </div>
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();
        window.location.href = 'login.html';
      });
    }
  } catch (err) {
    console.error('Failed to parse user session:', err);
  }
}

document.addEventListener('DOMContentLoaded', initAuthNavbar);