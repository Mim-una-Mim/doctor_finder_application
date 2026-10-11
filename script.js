// Hero search — forwards query to doctors.html
function executeHeroSearch() {
  const heroSearchInput = document.getElementById('heroSearch');
  const term = heroSearchInput ? heroSearchInput.value.trim() : '';
  const heroLocSelect = document.querySelector('.hero .search-location select');
  const loc = heroLocSelect ? heroLocSelect.value.trim() : '';
  const params = new URLSearchParams();
  if (term) params.append('search', term);
  if (loc && loc.toLowerCase() !== 'dinajpur' && loc.toLowerCase() !== 'all') {
    params.append('location', loc);
  }
  window.location.href = `doctors.html${params.toString() ? '?' + params.toString() : ''}`;
}

const heroSearch = document.getElementById('heroSearch');
if (heroSearch) {
  heroSearch.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeHeroSearch();
    }
  });
}

const heroSearchBtn = document.querySelector('.hero .search-btn');
if (heroSearchBtn) {
  heroSearchBtn.removeAttribute('onclick');
  heroSearchBtn.addEventListener('click', function (e) {
    e.preventDefault();
    executeHeroSearch();
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

    const roleBadge = user.role === 'admin' ? 'Admin' : (user.role === 'doctor' ? 'Dr.' : 'Patient');
    const roleIcon = user.role === 'admin' ? 'fa-shield-halved' : (user.role === 'doctor' ? 'fa-user-doctor' : 'fa-circle-user');
    const extraActionBtn = user.role === 'admin' 
      ? `<a href="admin.html" class="btn-primary" style="padding:7px 14px;font-size:13px;text-decoration:none;"><i class="fa-solid fa-chart-line"></i> Dashboard</a>`
      : `<button id="navApptsBtn" class="btn-outline" style="cursor:pointer;padding:7px 14px;font-size:13px;background:none;"><i class="fa-regular fa-calendar-check"></i> Appointments</button>`;

    navActions.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        ${extraActionBtn}
        <span style="font-size:14px;font-weight:600;color:var(--navy);display:flex;align-items:center;gap:6px;">
          <i class="fa-solid ${roleIcon}"></i>
          ${roleBadge} ${user.first_name}
        </span>
        <button id="logoutBtn" class="btn-outline" style="cursor:pointer;padding:7px 14px;font-size:13px;background:none;">
          <i class="fa-solid fa-right-from-bracket"></i> Log Out
        </button>
      </div>
    `;

    const navApptsBtn = document.getElementById('navApptsBtn');
    if (navApptsBtn) {
      navApptsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof openAppointmentsModal === 'function') {
          openAppointmentsModal();
        } else {
          window.location.href = 'doctors.html?view=appointments';
        }
      });
    }

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