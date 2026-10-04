
// ===== DOCTOR DATA =====
const doctors = [
  {
    name: "Dr. Rahim Uddin",
    specialty: "Cardiologist",
    hospital: "Dinajpur Medical Chamber",
    fees: "৳500",
    days: "Saturday – Thursday",
    rating: 4.5,
    reviewCount: 8,
    avatarText: "RU",
    avatarStyle: "background:#DCE9F6;color:#284A6E;",
    bio: "Dr. Rahim Uddin is a cardiologist with over 10 years of experience treating heart-related conditions. He completed his MBBS from Rajshahi Medical College.",
    slots: [
      { time: "9:00 AM",  seats: 3, full: false },
      { time: "10:00 AM", seats: 1, full: false },
      { time: "11:00 AM", seats: 0, full: true  },
      { time: "4:00 PM",  seats: 2, full: false },
    ],
    reviews: [
      { name: "Md. Faruk", stars: 5, comment: "Very experienced and caring doctor." },
      { name: "Sultana B.", stars: 4, comment: "Good service, a bit of waiting time." },
    ]
  },
  {
    name: "Dr. Sadia Islam",
    specialty: "Pediatrician",
    hospital: "City Health Center",
    fees: "৳400",
    days: "Sunday – Thursday",
    rating: 4.7,
    reviewCount: 13,
    avatarText: "SI",
    avatarStyle: "background:#e8f5e9;color:#2d7a3a;",
    bio: "Dr. Sadia Islam is a pediatrician dedicated to child health. She is known for her gentle approach with young patients and thorough examinations.",
    slots: [
      { time: "8:30 AM",  seats: 2, full: false },
      { time: "10:00 AM", seats: 0, full: true  },
      { time: "3:00 PM",  seats: 4, full: false },
    ],
    reviews: [
      { name: "Rahima K.", stars: 5, comment: "Best pediatrician in Dinajpur. My child recovered quickly." },
      { name: "Md. Jalal", stars: 4, comment: "Very kind and professional." },
    ]
  },
  {
    name: "Dr. Kamal Hossain",
    specialty: "Dermatologist",
    hospital: "Green Life Clinic",
    fees: "৳600",
    days: "Saturday – Wednesday",
    rating: 4.3,
    reviewCount: 6,
    avatarText: "KH",
    avatarStyle: "background:#fff3e0;color:#e65100;",
    bio: "Dr. Kamal Hossain specializes in skin, hair, and nail disorders. He has been serving patients in Dinajpur for 7 years.",
    slots: [],
    reviews: [
      { name: "Nasrin A.", stars: 4, comment: "Good doctor, explains everything clearly." },
    ]
  },
  {
    name: "Dr. Mimuna Parvin",
    specialty: "Gynecologist",
    hospital: "Sadar Hospital",
    fees: "৳500",
    days: "Saturday – Thursday",
    rating: 4.8,
    reviewCount: 21,
    avatarText: "MP",
    avatarStyle: "background:#f3e5f5;color:#6a1b9a;",
    bio: "Dr. Mimuna Parvin is a trusted gynecologist and obstetrician with 12 years of experience. She is highly regarded for her patient-centered care.",
    slots: [
      { time: "9:00 AM",  seats: 1, full: false },
      { time: "11:30 AM", seats: 3, full: false },
      { time: "5:00 PM",  seats: 0, full: true  },
    ],
    reviews: [
      { name: "Fatema B.", stars: 5, comment: "Excellent doctor. Very professional and reassuring." },
      { name: "Roksana M.", stars: 5, comment: "I highly recommend Dr. Mimuna to every woman." },
    ]
  }
];

// ===== SEARCH & FILTER =====
const searchInput   = document.getElementById('searchInput');
const cards         = document.querySelectorAll('.doctor-card-lg');
const noResults     = document.getElementById('noResults');
const resultsCount  = document.getElementById('resultsCount');

function filterDoctors() {
  const text     = searchInput.value.toLowerCase();
  const specialty = document.querySelector('input[name="specialty"]:checked').value;
  let count = 0;

  cards.forEach(card => {
    const nameMatch     = card.dataset.name.toLowerCase().includes(text);
    const specMatch     = card.dataset.specialty.toLowerCase().includes(text);
    const hospMatch     = card.dataset.hospital.toLowerCase().includes(text);
    const filterMatch   = specialty === 'all' || card.dataset.specialty === specialty;

    if ((nameMatch || specMatch || hospMatch) && filterMatch) {
      card.style.display = 'flex';
      count++;
    } else {
      card.style.display = 'none';
    }
  });

  resultsCount.textContent = `Showing ${count} doctor${count !== 1 ? 's' : ''}`;
  noResults.style.display  = count === 0 ? 'block' : 'none';
}

searchInput.addEventListener('input', filterDoctors);
document.querySelectorAll('input[name="specialty"]').forEach(r => r.addEventListener('change', filterDoctors));

// ===== SORT =====
document.getElementById('sortSelect').addEventListener('change', function () {
  const grid      = document.getElementById('doctorGrid');
  const cardArray = Array.from(grid.querySelectorAll('.doctor-card-lg'));

  if (this.value === 'name') {
    cardArray.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
  } else if (this.value === 'fees') {
    cardArray.sort((a, b) => parseInt(a.dataset.fees) - parseInt(b.dataset.fees));
  } else if (this.value === 'rating') {
    cardArray.sort((a, b) => parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating));
  }
  cardArray.forEach(c => grid.appendChild(c));
});

function clearFilters() {
  searchInput.value = '';
  document.querySelector('input[name="specialty"][value="all"]').checked = true;
  document.getElementById('availToday').checked   = false;
  document.getElementById('availWeekend').checked = false;
  filterDoctors();
}

// ===== PROFILE MODAL =====
function openProfile(i) {
  const d = doctors[i];
  document.getElementById('modalAvatar').textContent     = d.avatarText;
  document.getElementById('modalAvatar').style.cssText   = d.avatarStyle + 'width:90px;height:90px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;flex-shrink:0;border:3px solid #E5EDF5;';
  document.getElementById('modalName').textContent       = d.name;
  document.getElementById('modalSpecialty').textContent  = '🩺 ' + d.specialty;
  document.getElementById('modalHospital').textContent   = '🏥 ' + d.hospital;
  document.getElementById('modalFees').textContent       = d.fees;
  document.getElementById('modalDays').textContent       = d.days;
  document.getElementById('modalRating').textContent     = d.rating + ' / 5 (' + d.reviewCount + ' reviews)';
  document.getElementById('modalBio').textContent        = d.bio;

  // Reviews
  const reviewsHtml = d.reviews.map(r => `
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

document.getElementById('profileModal').addEventListener('click', function (e) {
  if (e.target === this) closeProfile();
});

// ===== BOOKING MODAL =====
let currentDoctorIndex = 0;
let selectedSlot       = null;

function openBooking(i) {
  currentDoctorIndex = i;
  selectedSlot       = null;
  const d = doctors[i];

  document.getElementById('bookingDoctorName').textContent = d.name + ' — ' + d.specialty;

  // Reset to normal tab
  setBookingType('normal');

  // Build slots
  const grid = document.getElementById('slotsGrid');
  const noMsg = document.getElementById('noSlotsMsg');

  if (d.slots.length === 0) {
    grid.innerHTML = '';
    noMsg.style.display = 'flex';
  } else {
    noMsg.style.display = 'none';
    grid.innerHTML = d.slots.map((s, idx) => `
      <button class="slot-btn ${s.full ? 'slot-full' : ''}" onclick="${s.full ? '' : 'selectSlot(' + idx + ', this)'}" ${s.full ? 'disabled' : ''}>
        <span class="slot-time">${s.time}</span>
        <span class="slot-seats">${s.full ? 'Full' : s.seats + ' seat' + (s.seats !== 1 ? 's' : '') + ' left'}</span>
      </button>
    `).join('');
  }

  document.getElementById('bookingModal').classList.add('open');
}

function selectSlot(idx, btn) {
  selectedSlot = idx;
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

document.getElementById('bookingModal').addEventListener('click', function (e) {
  if (e.target === this) closeBooking();
});

// ===== CONFIRM BOOKING =====
function confirmBooking(type) {
  if (type === 'normal' && !selectedSlot && selectedSlot !== 0) {
    showToast('Please select a time slot first.', 'error');
    return;
  }
  if (type === 'emergency') {
    const desc = document.getElementById('emergencyDesc').value.trim();
    if (!desc) {
      showToast('Please describe the emergency.', 'error');
      return;
    }
  }

  closeBooking();

  if (type === 'normal') {
    showToast('Appointment booked successfully!', 'success');
    // After a moment, open rating modal as demo
    setTimeout(() => openRating(currentDoctorIndex), 2500);
  } else {
    showToast('Emergency request sent! The doctor will respond shortly.', 'emergency');
  }
}

// ===== RATING MODAL =====
let selectedStars = 0;

function openRating(i) {
  selectedStars = 0;
  document.getElementById('ratingDoctorName').textContent = doctors[i].name;
  document.getElementById('starLabel').textContent = 'Tap a star to rate';
  document.getElementById('ratingComment').value = '';
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));
  document.getElementById('ratingModal').classList.add('open');
}

function closeRating() {
  document.getElementById('ratingModal').classList.remove('open');
}

document.getElementById('ratingModal').addEventListener('click', function (e) {
  if (e.target === this) closeRating();
});

function selectStar(val) {
  selectedStars = val;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  document.getElementById('starLabel').textContent = labels[val];

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
  const icon  = toast.querySelector('i');

  if (type === 'error') {
    toast.style.backgroundColor = '#c0392b';
    icon.className = 'fa-solid fa-circle-exclamation';
  } else if (type === 'emergency') {
    toast.style.backgroundColor = '#c0392b';
    icon.className = 'fa-solid fa-triangle-exclamation';
  } else {
    toast.style.backgroundColor = '#2d7a3a';
    icon.className = 'fa-solid fa-circle-check';
  }

  document.getElementById('toastMsg').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}