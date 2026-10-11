// ===== ADMIN DASHBOARD JAVASCRIPT =====
const API_BASE_URL = (window.location.port !== '5000') ? 'http://localhost:5000' : '';

// 1. Guard & Authentication Verification
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');

  if (!token || !userJson) {
    alert('Administrator access required. Please log in.');
    window.location.href = 'login.html';
    return;
  }

  try {
    const user = JSON.parse(userJson);
    if (user.role !== 'admin') {
      alert('Access denied. Administrator privileges required.');
      window.location.href = 'login.html';
      return;
    }

    const nameDisplay = document.getElementById('adminNameDisplay');
    if (nameDisplay) {
      nameDisplay.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Admin: ${user.first_name || 'System'}`;
    }
  } catch (e) {
    window.location.href = 'login.html';
    return;
  }

  // Setup Logout
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  }

  // Initial Data Load
  loadAllAdminData();
});

// Tab Switcher
function switchAdminTab(tabKey, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

  if (btn) btn.classList.add('active');
  const targetSection = document.getElementById(`section-${tabKey}`);
  if (targetSection) targetSection.classList.add('active');
}

// Master refresh
function loadAllAdminData() {
  loadSummary();
  loadDoctors();
  loadUsers();
  loadAppointments();
}

// 2. Fetch Summary Statistics
async function loadSummary() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/summary`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.summary) {
      document.getElementById('statPatients').textContent = data.summary.total_patients;
      document.getElementById('statDoctors').textContent = data.summary.total_doctors;
      document.getElementById('statAppointments').textContent = data.summary.total_appointments;
      document.getElementById('statPendingDoctors').textContent = data.summary.pending_doctors;
    }
  } catch (err) {
    console.error('Failed to load admin summary:', err);
  }
}

// 3. Fetch Doctors and Approvals
async function loadDoctors() {
  const token = localStorage.getItem('token');
  const tbody = document.getElementById('doctorsTableBody');
  tbody.innerHTML = `<tr><td colspan="8" class="empty-table"><i class="fa-solid fa-spinner fa-spin"></i> Loading doctors...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/doctors`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.doctors || data.doctors.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-table"><i class="fa-regular fa-folder-open"></i><p>No doctors found.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = data.doctors.map(d => {
      const status = d.approval_status || 'approved';
      const badgeClass = status === 'approved' ? 'badge-approved' : (status === 'pending' ? 'badge-pending' : 'badge-rejected');

      let actionBtns = '';
      if (status !== 'approved') {
        actionBtns += `
          <button class="btn-action btn-approve" onclick="updateDoctorApproval(${d.id}, 'approved')">
            <i class="fa-solid fa-check"></i> Approve
          </button>
        `;
      }
      if (status !== 'rejected') {
        actionBtns += `
          <button class="btn-action btn-reject" onclick="updateDoctorApproval(${d.id}, 'rejected')">
            <i class="fa-solid fa-ban"></i> Reject
          </button>
        `;
      }

      return `
        <tr>
          <td><strong>#${d.id}</strong></td>
          <td>
            <strong>${d.name}</strong><br>
            <span style="font-size:11px;color:var(--gray);">${d.degree || 'MBBS'}</span>
          </td>
          <td>${d.specialty}</td>
          <td><code>${d.bmdc_reg_no || 'N/A'}</code></td>
          <td>
            <div>${d.email}</div>
            <div style="font-size:11px;color:var(--gray);">${d.phone || ''}</div>
          </td>
          <td>${d.appointment_count} appts</td>
          <td><span class="badge ${badgeClass}">${status}</span></td>
          <td><div style="display:flex;gap:6px;">${actionBtns}</div></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load doctors:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-table" style="color:var(--red);">Error loading doctors data.</td></tr>`;
  }
}

// Update Doctor Approval Status
async function updateDoctorApproval(doctorId, newStatus) {
  const token = localStorage.getItem('token');
  const confirmMsg = `Are you sure you want to mark this doctor as "${newStatus}"?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/doctors/${doctorId}/approval`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadDoctors();
      loadSummary();
    } else {
      alert(data.message || 'Failed to update doctor approval status.');
    }
  } catch (err) {
    console.error('Error updating approval:', err);
    alert('Server error while updating doctor approval.');
  }
}

// 4. Fetch Users List
async function loadUsers() {
  const token = localStorage.getItem('token');
  const tbody = document.getElementById('usersTableBody');
  const roleSelect = document.getElementById('userRoleFilter');
  const roleFilter = roleSelect ? roleSelect.value : 'all';

  tbody.innerHTML = `<tr><td colspan="7" class="empty-table"><i class="fa-solid fa-spinner fa-spin"></i> Loading users...</td></tr>`;

  try {
    const url = roleFilter !== 'all' 
      ? `${API_BASE_URL}/api/admin/users?role=${roleFilter}` 
      : `${API_BASE_URL}/api/admin/users`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-table"><i class="fa-regular fa-folder-open"></i><p>No users found.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => {
      const roleBadge = u.role === 'doctor' ? 'badge-role-doctor' : 'badge-role-patient';
      const createdDate = u.created_at ? u.created_at.split('T')[0] : '';
      return `
        <tr>
          <td>#${u.id}</td>
          <td><strong>${u.first_name} ${u.last_name}</strong></td>
          <td><span class="badge ${roleBadge}">${u.role}</span></td>
          <td>${u.email}</td>
          <td>${u.phone || 'N/A'}</td>
          <td>${u.gender || 'N/A'}</td>
          <td><span style="color:var(--gray);font-size:12px;">${createdDate}</span></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load users:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-table" style="color:var(--red);">Error loading users list.</td></tr>`;
  }
}

// 5. Fetch Appointments List
async function loadAppointments() {
  const token = localStorage.getItem('token');
  const tbody = document.getElementById('appointmentsTableBody');
  tbody.innerHTML = `<tr><td colspan="7" class="empty-table"><i class="fa-solid fa-spinner fa-spin"></i> Loading appointments...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/appointments`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.appointments || data.appointments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-table"><i class="fa-regular fa-folder-open"></i><p>No appointments found.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = data.appointments.map(a => {
      const dateFormatted = a.appointment_date ? a.appointment_date.split('T')[0] : '';
      const typeBadge = a.is_emergency
        ? `<span class="badge badge-emergency"><i class="fa-solid fa-triangle-exclamation"></i> EMERGENCY</span>`
        : `<span class="badge" style="background:#e5edf5;color:#284a6e;">NORMAL</span>`;

      const statusBadgeClass = `badge-${a.status}`;

      const details = [];
      if (a.reason) details.push(`<em>${a.reason}</em>`);
      if (a.emergency_location) details.push(`<span style="color:var(--red);"><i class="fa-solid fa-location-dot"></i> ${a.emergency_location}</span>`);

      return `
        <tr>
          <td><strong>#${a.id}</strong></td>
          <td>${typeBadge}</td>
          <td>
            <strong>${a.patient_first_name} ${a.patient_last_name}</strong><br>
            <span style="font-size:11px;color:var(--gray);">${a.patient_phone || a.patient_email}</span>
          </td>
          <td>
            <strong>${a.doctor_name}</strong><br>
            <span style="font-size:11px;color:var(--steel);">${a.doctor_specialty || ''}</span>
          </td>
          <td>
            <div><i class="fa-regular fa-calendar"></i> ${dateFormatted}</div>
            <div style="font-size:12px;color:var(--gray);"><i class="fa-regular fa-clock"></i> ${a.appointment_time}</div>
          </td>
          <td><span class="badge ${statusBadgeClass}">${a.status}</span></td>
          <td style="max-width:260px;font-size:12px;">${details.join('<br>') || 'None'}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load appointments:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-table" style="color:var(--red);">Error loading appointments.</td></tr>`;
  }
}
