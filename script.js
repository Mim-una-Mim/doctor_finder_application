// Route the home-page search to the existing doctor search page.
function executeHeroSearch() {
  const input = document.getElementById('heroSearch');
  const locationSelect = document.getElementById('heroLocation');
  const params = new URLSearchParams();
  const term = input ? input.value.trim() : '';
  const location = locationSelect ? locationSelect.value.trim() : '';
  if (term) params.set('search', term);
  if (location && location.toLowerCase() !== 'all') params.set('location', location);
  window.location.href = `doctors.html${params.toString() ? `?${params}` : ''}`;
}

function initAuthNavbar() {
  const userJson = localStorage.getItem('user');
  const navActions = document.querySelector('.nav-actions');
  if (!userJson || !navActions) return;

  try {
    const user = JSON.parse(userJson);
    const roleLabel = user.role === 'admin' ? 'Admin' : user.role === 'doctor' ? 'Dr.' : 'Patient';
    const dashboard = user.role === 'admin'
      ? '<a href="admin.html" class="btn-primary">Dashboard</a>'
      : '<a href="doctors.html?view=appointments" class="btn-outline">Appointments</a>';
    navActions.innerHTML = `${dashboard}<span class="nav-user">${roleLabel} ${user.first_name || ''}</span><button id="logoutBtn" class="btn-outline" type="button">Log Out</button>`;
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  } catch (error) {
    console.error('Failed to read the signed-in user:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAuthNavbar();

  const searchForm = document.querySelector('.home-search');
  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    executeHeroSearch();
  });

  const navToggle = document.querySelector('.nav-toggle');
  navToggle?.addEventListener('click', () => {
    const navbar = document.querySelector('.navbar');
    const open = navbar?.classList.toggle('menu-open') ?? false;
    navToggle.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.nav-menu a').forEach((link) => {
    link.addEventListener('click', () => document.querySelector('.navbar')?.classList.remove('menu-open'));
  });

  const newsletterForm = document.getElementById('newsletterForm');
  newsletterForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const feedback = document.getElementById('newsletterFeedback');
    if (feedback) feedback.textContent = 'Thanks! Your message has been received.';
    newsletterForm.reset();
  });

  document.querySelectorAll('.selectable').forEach((control) => {
    control.addEventListener('click', () => {
      if (control.matches('a[href]')) return;
      document.querySelectorAll('.selectable[aria-pressed]').forEach((item) => {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      });
      control.classList.add('selected');
      control.setAttribute('aria-pressed', 'true');
    });
  });
});
