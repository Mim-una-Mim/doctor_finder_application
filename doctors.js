// ===== API CONFIGURATION =====
// Uses window.CLOUD_API_URL if configured; otherwise uses same origin on cloud (e.g. Render)
// or port 5000, and falls back to http://localhost:5000 only on a local dev server (e.g. Live Server).
const isLocalDevServer = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000';
const API_BASE_URL = window.CLOUD_API_URL || (isLocalDevServer ? 'http://localhost:5000' : '');

// Global memory array of doctors (loaded from MySQL backend)
let doctors = [];

// Helper: Generate avatar initials
function getInitials(name) {
  if (!name) return 'DR';
  const clean = name.replace(/^Dr\.\s*/i, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

// Avatar palette matching existing theme
const avatarStyles = [
  'background:#F6DBC0;color:#502D55;',
  'background:#F6DBC0;color:#502D55;',
  'background:#F6DBC0;color:#935073;',
  'background:#F6DBC0;color:#502D55;'
];

// ===== RENDER DOCTOR CARDS =====
function renderDoctorCards(list) {
  const grid = document.getElementById('doctorGrid');
  const resultsCount = document.getElementById('resultsCount');
  const noResults = document.getElementById('noResults');

  if (!grid) return;

  grid.innerHTML = '';
  resultsCount.textContent = `Showing ${list.length} doctor${list.length !== 1 ? 's' : ''}`;
  noResults.style.display = list.length === 0 ? 'block' : 'none';

  list.forEach((d, idx) => {
    const card = document.createElement('div');
    card.className = 'doctor-card-lg';
    card.dataset.id = d.id;
    card.dataset.name = d.name;
    card.dataset.specialty = d.specialty;
    card.dataset.hospital = d.hospital || d.chamber_address || 'Dinajpur';
    card.dataset.location = d.location || 'Sadar';
    card.dataset.fees = d.fees || 500;
    card.dataset.rating = d.rating || 4.5;
    card.dataset.availableToday = d.available_today ? 'true' : 'false';
    card.dataset.availableWeekend = d.available_weekend ? 'true' : 'false';

    const avatarStyle = d.avatarStyle || avatarStyles[idx % avatarStyles.length];
    const avatarText = d.avatarText || getInitials(d.name);
    const availTag = d.available_today
      ? '<span class="tag available">Available Today</span>'
      : '<span class="tag unavailable">Unavailable Today</span>';

    card.innerHTML = `
      <div class="doc-avatar-lg" style="${avatarStyle}">${avatarText}</div>
      <div class="card-info">
        <div class="card-top">
          <div>
            <h3>${d.name}</h3>
            <p class="specialty"><i class="fa-solid fa-stethoscope"></i> ${d.specialty}</p>
            <p class="hospital"><i class="fa-solid fa-hospital"></i> ${d.hospital || 'Dinajpur Chamber'}</p>
          </div>
          <span class="fees-badge">৳${d.fees || 500}</span>
        </div>
        <div class="card-tags">
          <span class="tag"><i class="fa-regular fa-clock"></i> ${d.available_days || 'Sat–Thu'}</span>
          <span class="tag rating-tag"><i class="fa-solid fa-star"></i> ${d.rating || 4.5} <span class="rating-count">(${d.reviewCount || 8} reviews)</span></span>
          ${availTag}
        </div>
        <div class="card-actions">
          <button class="view-btn" onclick="openProfile(${idx})">View Profile</button>
          <button class="book-btn-lg" onclick="openBooking(${idx})">Book Appointment</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Populate specialty filters dynamically from backend doctors list
function populateSpecialtyFilters(doctorList) {
  const container = document.getElementById('specialtyFilterGroup');
  if (!container || !Array.isArray(doctorList) || doctorList.length === 0) return;

  const currentChecked = document.querySelector('input[name="specialty"]:checked')?.value || 'all';

  // Collect distinct non-empty specialties
  const uniqueMap = new Map();
  doctorList.forEach(d => {
    if (d && d.specialty) {
      const clean = d.specialty.trim();
      if (clean) {
        const key = clean.toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, clean);
        }
      }
    }
  });

  const sortedSpecialties = Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b));
  if (sortedSpecialties.length === 0) return;

  let html = `<h4>Specialty</h4>\n<label><input type="radio" name="specialty" value="all" ${currentChecked === 'all' ? 'checked' : ''} /> All</label>`;
  sortedSpecialties.forEach(sp => {
    const isChecked = (currentChecked.toLowerCase() === sp.toLowerCase()) ? 'checked' : '';
    html += `\n<label><input type="radio" name="specialty" value="${sp}" ${isChecked} /> ${sp}</label>`;
  });

  container.innerHTML = html;

  // Re-attach change listeners
  container.querySelectorAll('input[name="specialty"]').forEach(r => {
    r.addEventListener('change', () => {
      loadDoctors();
    });
  });
}

let hasPopulatedSpecialties = false;

// ===== FETCH DOCTORS FROM MYSQL BACKEND =====
async function loadDoctors() {
  const search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';
  const specialtyRadio = document.querySelector('input[name="specialty"]:checked');
  const specialty = specialtyRadio ? specialtyRadio.value : 'all';
  const locationSelect = document.getElementById('locationFilter');
  const location = locationSelect ? locationSelect.value : 'all';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (specialty && specialty !== 'all') params.append('specialty', specialty);
  if (location && location !== 'all') params.append('location', location);

  try {
    const res = await fetch(`${API_BASE_URL}/api/doctors?${params.toString()}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.doctors)) {
      doctors = data.doctors.map((d, i) => ({
        ...d,
        avatarText: getInitials(d.name),
        avatarStyle: avatarStyles[i % avatarStyles.length],
        rating: d.rating || (4.3 + (i % 6) * 0.1).toFixed(1),
        reviewCount: d.reviewCount || (8 + i * 3),
        reviews: [
          { name: 'Md. Faruk', stars: 5, comment: 'Very experienced and caring doctor.' },
          { name: 'Sultana B.', stars: 4, comment: 'Good service and detailed consultation.' }
        ]
      }));

      // On first unfiltered load (or if not yet populated), populate the specialty list dynamically
      if (!hasPopulatedSpecialties && (!search && specialty === 'all' && location === 'all')) {
        populateSpecialtyFilters(doctors);
        hasPopulatedSpecialties = true;
      }

      filterDoctorCardsInMemory();
    }
  } catch (err) {
    console.error('Failed to load doctors from backend:', err);
  }
}

// Memory filter for instant UI response and checkbox filters
function filterDoctorCardsInMemory() {
  const availTodayChecked = document.getElementById('availToday') ? document.getElementById('availToday').checked : false;
  const availWeekendChecked = document.getElementById('availWeekend') ? document.getElementById('availWeekend').checked : false;

  let filtered = doctors.slice();

  if (availTodayChecked) {
    filtered = filtered.filter(d => d.available_today);
  }
  if (availWeekendChecked) {
    filtered = filtered.filter(d => d.available_weekend);
  }

  // Sort
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    if (sortSelect.value === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortSelect.value === 'fees') {
      filtered.sort((a, b) => parseFloat(a.fees) - parseFloat(b.fees));
    } else if (sortSelect.value === 'rating') {
      filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
    }
  }

  renderDoctorCards(filtered);
}

// ===== EVENT LISTENERS =====
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    loadDoctors();
  });
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadDoctors();
    }
  });
}

const searchBtn = document.querySelector('.search-btn');
if (searchBtn) {
  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadDoctors();
  });
}

document.querySelectorAll('input[name="specialty"]').forEach(r => {
  r.addEventListener('change', () => {
    loadDoctors();
  });
});

const locationFilter = document.getElementById('locationFilter');
if (locationFilter) {
  locationFilter.addEventListener('change', () => {
    loadDoctors();
  });
}

const availToday = document.getElementById('availToday');
if (availToday) {
  availToday.addEventListener('change', filterDoctorCardsInMemory);
}

const availWeekend = document.getElementById('availWeekend');
if (availWeekend) {
  availWeekend.addEventListener('change', filterDoctorCardsInMemory);
}

const sortSelect = document.getElementById('sortSelect');
if (sortSelect) {
  sortSelect.addEventListener('change', filterDoctorCardsInMemory);
}

function clearFilters() {
  if (searchInput) searchInput.value = '';
  const allRadio = document.querySelector('input[name="specialty"][value="all"]');
  if (allRadio) allRadio.checked = true;
  if (locationFilter) locationFilter.value = 'all';
  if (availToday) availToday.checked = false;
  if (availWeekend) availWeekend.checked = false;
  if (sortSelect) sortSelect.value = 'default';
  loadDoctors();
}

// ===== PROFILE MODAL =====
function openProfile(i) {
  const d = doctors[i];
  if (!d) return;

  const modalAvatar = document.getElementById('modalAvatar');
  modalAvatar.textContent = d.avatarText;
  modalAvatar.style.cssText = d.avatarStyle + 'width:90px;height:90px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;flex-shrink:0;border:3px solid #F6DBC0;';

  document.getElementById('modalName').textContent = d.name;
  document.getElementById('modalSpecialty').textContent = '🩺 ' + d.specialty + (d.degree ? ` (${d.degree})` : '');
  document.getElementById('modalHospital').textContent = '🏥 ' + (d.hospital || 'Dinajpur Chamber');
  document.getElementById('modalFees').textContent = '৳' + (d.fees || 500);
  document.getElementById('modalDays').textContent = d.available_days || 'Sat–Thu';
  document.getElementById('modalRating').textContent = (d.rating || 4.5) + ' / 5 (' + (d.reviewCount || 8) + ' reviews)';
  document.getElementById('modalBio').textContent = d.bio || 'Verified specialist doctor.';

  // Reviews
  const reviewsHtml = (d.reviews || []).map(r => `
    <div class="review-item">
      <div class="review-header">
        <span class="review-name">${r.name}</span>
        <span class="review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
      </div>
      <p class="review-comment">${r.comment}</p>
    </div>
  `).join('');
  document.getElementById('modalReviews').innerHTML = reviewsHtml || '<p style="color:#888;font-size:13px;">No reviews yet.</p>';

  document.getElementById('modalBookBtn').onclick = function () {
    closeProfile();
    openBooking(i);
  };

  document.getElementById('profileModal').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileModal').classList.remove('open');
}

const profileModalEl = document.getElementById('profileModal');
if (profileModalEl) {
  profileModalEl.addEventListener('click', function (e) {
    if (e.target === this) closeProfile();
  });
}

// ===== BOOKING MODAL =====
let currentDoctorIndex = 0;
let selectedSlot = null; // will store slot label, e.g. "4:00 PM"
let currentDoctorSlots = [];

async function fetchDoctorSlots(doctorId, dateStr) {
  const grid = document.getElementById('slotsGrid');
  const noMsg = document.getElementById('noSlotsMsg');
  grid.innerHTML = '<span style="font-size:13px;color:var(--gray);">Loading available slots...</span>';
  noMsg.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE_URL}/api/doctors/${doctorId}/slots?date=${dateStr}`);
    const data = await res.json();

    if (!data.success || !data.available || !data.slots || data.slots.length === 0) {
      grid.innerHTML = '';
      noMsg.style.display = 'flex';
      noMsg.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${data.message || 'No slots available for this date. Please select another day.'}`;
      currentDoctorSlots = [];
      return;
    }

    currentDoctorSlots = data.slots;
    noMsg.style.display = 'none';

    grid.innerHTML = data.slots.map((s, idx) => `
      <button type="button" class="slot-btn ${s.full ? 'slot-full' : ''}" onclick="${s.full ? '' : `selectSlot(${idx}, this)`}" ${s.full ? 'disabled' : ''}>
        <span class="slot-time">${s.time}</span>
        <span class="slot-seats">${s.full ? 'Booked' : (s.seats + ' left')}</span>
      </button>
    `).join('');
  } catch (err) {
    grid.innerHTML = '';
    noMsg.style.display = 'flex';
    noMsg.innerHTML = `<i class="fa-solid fa-circle-info"></i> Unable to load slots. Please check your connection.`;
  }
}

function openBooking(i) {
  currentDoctorIndex = i;
  selectedSlot = null;
  const d = doctors[i];
  if (!d) return;

  document.getElementById('bookingDoctorName').textContent = d.name + ' — ' + d.specialty;

  // Pre-fill patient details if logged in
  const userJson = localStorage.getItem('user');
  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      const nameInput = document.getElementById('patientName');
      const phoneInput = document.getElementById('patientPhone');
      if (nameInput && !nameInput.value) nameInput.value = `${u.first_name} ${u.last_name}`;
      if (phoneInput && !phoneInput.value) phoneInput.value = u.phone || '';

      const emNameInput = document.getElementById('emergencyName');
      const emPhoneInput = document.getElementById('emergencyPhone');
      if (emNameInput && !emNameInput.value) emNameInput.value = `${u.first_name} ${u.last_name}`;
      if (emPhoneInput && !emPhoneInput.value) emPhoneInput.value = u.phone || '';
    } catch (e) {}
  }

  // Set appointment date input
  const dateInput = document.getElementById('appointmentDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    if (!dateInput.value || dateInput.value < today) {
      dateInput.value = today;
    }

    // Refresh slots on date change
    dateInput.onchange = () => {
      fetchDoctorSlots(d.id, dateInput.value);
    };

    fetchDoctorSlots(d.id, dateInput.value);
  }

  setBookingType('normal');
  document.getElementById('bookingModal').classList.add('open');
}

function selectSlot(idx, btn) {
  const slotObj = currentDoctorSlots[idx];
  if (!slotObj || slotObj.full) return;

  selectedSlot = slotObj.time;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function setBookingType(type) {
  document.getElementById('tabNormal').classList.toggle('active', type === 'normal');
  document.getElementById('tabEmergency').classList.toggle('active', type === 'emergency');
  document.getElementById('normalBookingForm').style.display  = type === 'normal'    ? 'flex' : 'none';
  document.getElementById('emergencyForm').style.display      = type === 'emergency' ? 'flex' : 'none';
}

function closeBooking() {
  document.getElementById('bookingModal').classList.remove('open');
}

const bookingModalEl = document.getElementById('bookingModal');
if (bookingModalEl) {
  bookingModalEl.addEventListener('click', function (e) {
    if (e.target === this) closeBooking();
  });
}

// ===== CONFIRM BOOKING (SUBMIT TO MYSQL) =====
async function confirmBooking(type) {
  const d = doctors[currentDoctorIndex];
  if (!d) return;

  const token = localStorage.getItem('token');
  if (!token) {
    showToast('Please log in as a patient to book an appointment.', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
    return;
  }

  if (type === 'normal') {
    const dateInput = document.getElementById('appointmentDate');
    const appointmentDate = dateInput ? dateInput.value : '';
    const reason = document.getElementById('patientReason') ? document.getElementById('patientReason').value.trim() : '';

    if (!appointmentDate) {
      showToast('Please select an appointment date.', 'error');
      return;
    }

    if (!selectedSlot) {
      showToast('Please select an available time slot.', 'error');
      return;
    }

    const payload = {
      doctor_id: d.id,
      appointment_date: appointmentDate,
      appointment_time: selectedSlot,
      reason: reason
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.message || 'Booking failed. Slot may already be taken.', 'error');
        // Refresh slots in case of double-booking conflict
        fetchDoctorSlots(d.id, appointmentDate);
        return;
      }

      closeBooking();
      showToast('Appointment booked successfully! Status: Pending.', 'success');

      // Refresh doctor slots
      fetchDoctorSlots(d.id, appointmentDate);

      // Open rating demo modal after delay
      setTimeout(() => openRating(currentDoctorIndex), 2500);

    } catch (err) {
      showToast('Server error while booking. Please try again.', 'error');
    }
  } else {
    // EMERGENCY BOOKING
    const desc = document.getElementById('emergencyDesc') ? document.getElementById('emergencyDesc').value.trim() : '';
    const location = document.getElementById('emergencyLocation') ? document.getElementById('emergencyLocation').value.trim() : '';
    const name = document.getElementById('emergencyName') ? document.getElementById('emergencyName').value.trim() : '';
    const phone = document.getElementById('emergencyPhone') ? document.getElementById('emergencyPhone').value.trim() : '';

    if (!desc) {
      showToast('Please describe the emergency.', 'error');
      return;
    }

    const payload = {
      doctor_id: d.id,
      description: desc,
      location: location,
      contact_name: name,
      contact_phone: phone
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.message || 'Emergency request failed. Please try again.', 'error');
        return;
      }

      closeBooking();
      // Clear description for next time
      const descInput = document.getElementById('emergencyDesc');
      if (descInput) descInput.value = '';

      showToast(data.message || 'Emergency request sent! The doctor has been notified.', 'emergency');
    } catch (err) {
      showToast('Server error sending emergency request. Please try again.', 'error');
    }
  }
}

// ===== RATING MODAL =====
let selectedStars = 0;

function openRating(i) {
  selectedStars = 0;
  const d = doctors[i];
  if (!d) return;

  document.getElementById('ratingDoctorName').textContent = d.name;
  document.getElementById('starLabel').textContent = 'Tap a star to rate';
  const commentInput = document.getElementById('ratingComment');
  if (commentInput) commentInput.value = '';
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));
  document.getElementById('ratingModal').classList.add('open');
}

function closeRating() {
  document.getElementById('ratingModal').classList.remove('open');
}

const ratingModalEl = document.getElementById('ratingModal');
if (ratingModalEl) {
  ratingModalEl.addEventListener('click', function (e) {
    if (e.target === this) closeRating();
  });
}

function selectStar(val) {
  selectedStars = val;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  document.getElementById('starLabel').textContent = labels[val] || '';

  document.querySelectorAll('.star-btn').forEach((s, i) => {
    s.classList.toggle('active', i < val);
  });
}

function submitRating() {
  if (!selectedStars) {
    showToast('Please select a star rating.', 'error');
    return;
  }
  closeRating();
  showToast('Thank you for your rating!', 'success');
}

// ===== TOAST =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const icon  = toast.querySelector('i');

  if (type === 'error') {
    toast.style.backgroundColor = '#c0392b';
    if (icon) icon.className = 'fa-solid fa-circle-exclamation';
  } else if (type === 'emergency') {
    toast.style.backgroundColor = '#c0392b';
    if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
  } else {
    toast.style.backgroundColor = '#502D55';
    if (icon) icon.className = 'fa-solid fa-circle-check';
  }

  const msgSpan = document.getElementById('toastMsg');
  if (msgSpan) msgSpan.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===== APPOINTMENTS MODAL (PATIENT & DOCTOR MANAGEMENT) =====
async function openAppointmentsModal() {
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');

  if (!token || !userJson) {
    showToast('Please log in to view your appointments.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return;
  }

  const user = JSON.parse(userJson);
  const isDoctor = user.role === 'doctor';
  const modal = document.getElementById('appointmentsModal');
  const subtitle = document.getElementById('appointmentsSubtitle');
  const listContainer = document.getElementById('appointmentsList');

  if (!modal || !listContainer) return;

  subtitle.textContent = isDoctor 
    ? 'Manage incoming patient appointment requests and updates.'
    : 'View your scheduled doctor appointments and statuses.';

  listContainer.innerHTML = '<span style="font-size:13px;color:var(--gray);">Loading appointments...</span>';
  modal.classList.add('open');

  const endpoint = isDoctor ? '/api/doctor/appointments' : '/api/patient/appointments';

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.appointments || data.appointments.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center;padding:30px;color:var(--gray);">
          <i class="fa-regular fa-calendar-xmark" style="font-size:32px;margin-bottom:10px;color:var(--steel);"></i>
          <p>No appointments found.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = data.appointments.map(a => {
      const dateFormatted = a.appointment_date ? a.appointment_date.split('T')[0] : '';
      const statusBadgeColors = {
        pending: 'background:#F6DBC0;color:#502D55;',
        confirmed: 'background:#F6DBC0;color:#502D55;',
        completed: 'background:#F6DBC0;color:#502D55;',
        cancelled: 'background:#F6DBC0;color:#c0392b;'
      };

      const badgeStyle = statusBadgeColors[a.status] || statusBadgeColors.pending;

      let actionsHtml = '';
      if (isDoctor) {
        if (a.status === 'pending') {
          actionsHtml = `
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="confirm-btn" style="padding:6px 14px;font-size:12px;margin:0;background:#502D55;" onclick="updateAppointmentStatus(${a.id}, 'confirmed')">
                <i class="fa-solid fa-check"></i> Confirm
              </button>
              <button class="confirm-btn" style="padding:6px 14px;font-size:12px;margin:0;background:#c0392b;" onclick="updateAppointmentStatus(${a.id}, 'cancelled')">
                <i class="fa-solid fa-xmark"></i> Reject
              </button>
            </div>
          `;
        } else if (a.status === 'confirmed') {
          actionsHtml = `
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="confirm-btn" style="padding:6px 14px;font-size:12px;margin:0;" onclick="updateAppointmentStatus(${a.id}, 'completed')">
                <i class="fa-solid fa-circle-check"></i> Mark Completed
              </button>
              <button class="confirm-btn" style="padding:6px 14px;font-size:12px;margin:0;background:#c0392b;" onclick="updateAppointmentStatus(${a.id}, 'cancelled')">
                <i class="fa-solid fa-ban"></i> Cancel
              </button>
            </div>
          `;
        }
      } else {
        // Patient action
        if (a.status === 'pending' || a.status === 'confirmed') {
          actionsHtml = `
            <div style="margin-top:10px;">
              <button class="btn-outline" style="cursor:pointer;padding:5px 12px;font-size:12px;color:#c0392b;border-color:#935073;" onclick="updateAppointmentStatus(${a.id}, 'cancelled')">
                <i class="fa-solid fa-ban"></i> Cancel Appointment
              </button>
            </div>
          `;
        }
      }

      const partyInfo = isDoctor
        ? `<strong>Patient:</strong> ${a.patient_first_name} ${a.patient_last_name} (${a.patient_phone || 'No phone'})`
        : `<strong>Doctor:</strong> ${a.doctor_name} — ${a.doctor_specialty || ''}`;

      const emergencyBadge = a.is_emergency
        ? `<span style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:20px;text-transform:uppercase;background:#F6DBC0;color:#c0392b;margin-right:6px;"><i class="fa-solid fa-triangle-exclamation"></i> EMERGENCY</span>`
        : '';

      const locationHtml = a.emergency_location
        ? `<div style="font-size:12px;color:var(--gray);margin-top:2px;"><i class="fa-solid fa-location-dot" style="color:#c0392b;"></i> <em>Location:</em> ${a.emergency_location}</div>`
        : '';

      return `
        <div style="background:var(--alice);border:1px solid ${a.is_emergency ? '#935073' : 'var(--light-gray)'};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:14px;color:var(--charcoal);">${partyInfo}</span>
            <div style="display:flex;align-items:center;">
              ${emergencyBadge}
              <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;${badgeStyle}">
                ${a.status}
              </span>
            </div>
          </div>
          <div style="font-size:13px;color:var(--gray);margin-top:4px;">
            <span><i class="fa-regular fa-calendar"></i> ${dateFormatted}</span> &nbsp;|&nbsp;
            <span><i class="fa-regular fa-clock"></i> ${a.appointment_time}</span>
          </div>
          ${locationHtml}
          ${a.reason ? `<div style="font-size:12px;color:var(--gray);margin-top:2px;"><em>Reason:</em> ${a.reason}</div>` : ''}
          ${actionsHtml}
        </div>
      `;
    }).join('');

  } catch (err) {
    listContainer.innerHTML = '<span style="font-size:13px;color:#c0392b;">Error loading appointments. Please try again.</span>';
  }
}

async function updateAppointmentStatus(appointmentId, status) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Appointment status updated to ${status}.`, 'success');
      openAppointmentsModal(); // Refresh modal list
    } else {
      showToast(data.message || 'Status update failed.', 'error');
    }
  } catch (err) {
    showToast('Network error while updating appointment.', 'error');
  }
}

function closeAppointments() {
  const modal = document.getElementById('appointmentsModal');
  if (modal) modal.classList.remove('open');
}

const appointmentsModalEl = document.getElementById('appointmentsModal');
if (appointmentsModalEl) {
  appointmentsModalEl.addEventListener('click', function (e) {
    if (e.target === this) closeAppointments();
  });
}

// Initialise page: read URL query parameters if navigated from home page or elsewhere
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const initialSearch = urlParams.get('search');
  const initialLocation = urlParams.get('location');

  if (initialSearch) {
    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) searchInputEl.value = initialSearch;
  }

  if (initialLocation) {
    const locFilterEl = document.getElementById('locationFilter');
    if (locFilterEl) locFilterEl.value = initialLocation.toLowerCase();
  }

  loadDoctors();

  if (urlParams.get('view') === 'appointments') {
    setTimeout(openAppointmentsModal, 300);
  }
});