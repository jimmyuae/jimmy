guard('admin');
setupSections();

let storesCache = [];
let usersCache = [];
let attendanceCache = [];
let adminCache = null;
let signupRequestsCache = [];
let passwordRequestsCache = [];

async function bootAdmin() {
  const me = await api('/api/me');
  adminCache = me.user;
  renderAdminProfile(me.user);
  const now = new Date();
  reportMonth.value = now.getMonth() === 0 ? 12 : now.getMonth();
  reportYear.value = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  await refreshAll();
}

function renderAdminProfile(u) {
  adminWelcome.textContent = `${u.name || 'Admin'} | Backend control panel`;
  adminDashboardAvatar.innerHTML = avatarHtml(u.profile_image_path, u.name);
  adminProfileAvatar.innerHTML = avatarHtml(u.profile_image_path, u.name);
  adminDashboardName.textContent = u.name || 'Admin';
  adminDashboardId.textContent = u.employee_code || u.email || '-';
  adminLastLogin.textContent = fmtDate(u.last_login_at);
  adminLastLogout.textContent = fmtDate(u.last_logout_at);
  adminProfileName.textContent = u.name || '-';
  adminProfileId.textContent = u.employee_code || u.email || '-';
  adminProfileRole.textContent = u.role || '-';
}

async function uploadAdminProfilePhoto() {
  try {
    const file = adminProfilePhotoInput.files[0];
    if (!file) return alert('Please choose a profile picture first.');
    const image = await fileToDataUrl(file);
    await api('/api/profile/photo', { method: 'POST', body: JSON.stringify({ image }) });
    const me = await api('/api/me');
    adminCache = me.user;
    localStorage.setItem('user', JSON.stringify(me.user));
    renderAdminProfile(me.user);
    adminProfilePhotoInput.value = '';
    alert('Profile picture updated.');
  } catch (err) { alert(err.message); }
}

async function refreshAll() {
  await loadStores();
  await loadUsers();
  await loadSignupRequests();
  await loadPasswordResetRequests();
  await loadProducts();
  await loadAttendance();
  await loadWorkStatus();
  await loadReports();
}

async function loadWorkStatus() {
  try {
    const data = await api('/api/admin/work-status');
    statWorkingNow.textContent = Number(data.working_now || 0);
    statFinishedToday.textContent = Number(data.finished_today || 0);
  } catch (err) {
    console.warn('Could not load admin work status totals', err);
    statWorkingNow.textContent = '0';
    statFinishedToday.textContent = '0';
  }
}

async function loadUsers() {
  const data = await api('/api/admin/users');
  usersCache = data.users;
  const workers = data.users.filter(u => u.role === 'worker' && u.active);
  statWorkers.textContent = workers.length;
  renderUsers();
}

function renderUsers() {
  const q = (userSearchFilter?.value || '').trim().toLowerCase();
  const group = userGroupFilter?.value || '';
  const storeId = userStoreFilter?.value || '';
  const filtered = usersCache.filter(u => {
    const hay = [u.name, u.email, u.employee_code, u.role, u.store_group, u.store_name].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (group && (u.store_group || 'General') !== group) return false;
    if (storeId && String(u.assigned_store_id || '') !== String(storeId)) return false;
    return true;
  });
  usersRows.innerHTML = filtered.map(u => `
    <tr>
      <td>${avatarHtml(u.profile_image_path, u.name)}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.employee_code || '-')}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.role === 'worker' ? 'Merchandiser' : u.role)}</td>
      <td>${escapeHtml(u.store_group || '-')}</td>
      <td>${escapeHtml(u.store_name || '-')}</td>
      <td><span class="badge ${Number(u.location_warning_count || 0) ? 'bad' : 'ok'}">${Number(u.location_warning_count || 0)}</span></td>
      <td>${fmtDate(u.last_login_at)}</td>
      <td><span class="badge ${u.active ? 'ok' : 'bad'}">${u.active ? 'Active' : 'Inactive'}</span></td>
      <td>${u.active && u.id !== adminCache.id ? `<button class="small danger" onclick="deactivateUser(${u.id})">Remove</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="11">No users match this filter.</td></tr>';
}

async function loadSignupRequests() {
  try {
    const data = await api('/api/admin/signup-requests');
    signupRequestsCache = data.requests || [];
    statPendingRequests.textContent = signupRequestsCache.filter(r => r.approval_status === 'pending').length;
    renderSignupRequests();
  } catch (err) {
    console.warn('Could not load signup requests', err);
    statPendingRequests.textContent = '0';
    if (typeof signupRequestRows !== 'undefined') signupRequestRows.innerHTML = '<tr><td colspan="10">Could not load signup requests.</td></tr>';
  }
}

function renderSignupRequests() {
  signupRequestRows.innerHTML = signupRequestsCache.map(r => `
    <tr>
      <td>${avatarHtml(r.profile_image_path, r.name)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.phone || '-')}</td>
      <td>${escapeHtml(r.employee_code || '-')}</td>
      <td>${escapeHtml(r.store_group || '-')}</td>
      <td>${escapeHtml(r.store_name || '-')}${Number(r.needs_store_creation) ? '<br><span class="badge warn">New store request</span>' : ''}</td>
      <td>${fmtDate(r.approval_requested_at)}</td>
      <td><span class="badge ${r.approval_status === 'pending' ? 'warn' : 'bad'}">${escapeHtml(r.approval_status || 'pending')}</span></td>
      <td>${r.approval_status === 'pending' ? `<div class="toolbar"><button class="small" onclick="approveSignup(${r.id})">Approve</button><button class="small danger" onclick="declineSignup(${r.id})">Decline</button></div>` : '<span class="muted">Reviewed</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="10">No pending signup requests.</td></tr>';
}

async function loadPasswordResetRequests() {
  try {
    const data = await api('/api/admin/password-reset-requests');
    passwordRequestsCache = data.requests || [];
    if (typeof statPendingPasswordRequests !== 'undefined') {
      statPendingPasswordRequests.textContent = passwordRequestsCache.filter(r => r.status === 'pending').length;
    }
    renderPasswordResetRequests();
  } catch (err) {
    console.warn('Could not load password reset requests', err);
    if (typeof statPendingPasswordRequests !== 'undefined') statPendingPasswordRequests.textContent = '0';
    if (typeof passwordRequestRows !== 'undefined') passwordRequestRows.innerHTML = '<tr><td colspan="10">Could not load password reset requests.</td></tr>';
  }
}

function renderPasswordResetRequests() {
  passwordRequestRows.innerHTML = passwordRequestsCache.map(r => `
    <tr>
      <td>${avatarHtml(r.profile_image_path, r.name)}</td>
      <td>${escapeHtml(r.name || '-')}</td>
      <td>${escapeHtml(r.email || '-')}</td>
      <td>${escapeHtml(r.phone || '-')}</td>
      <td>${escapeHtml(r.employee_code || '-')}</td>
      <td>${escapeHtml(r.role === 'worker' ? 'Merchandiser' : (r.role || '-'))}</td>
      <td>${escapeHtml(r.identifier_snapshot || '-')}</td>
      <td>${fmtDate(r.requested_at)}</td>
      <td><span class="badge ${r.status === 'pending' ? 'warn' : 'bad'}">${escapeHtml(r.status || 'pending')}</span></td>
      <td>${r.status === 'pending' ? `<div class="toolbar"><button class="small" onclick="approvePasswordReset(${r.id})">Approve</button><button class="small danger" onclick="declinePasswordReset(${r.id})">Decline</button></div>` : '<span class="muted">Reviewed</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="10">No password reset requests.</td></tr>';
}

async function approvePasswordReset(id) {
  const request = passwordRequestsCache.find(r => Number(r.id) === Number(id));
  const name = request ? `${request.name} (${request.employee_code || request.email || request.phone || 'account'})` : 'this account';
  if (!confirm(`Approve password reset request for ${name}?`)) return;
  try {
    const result = await api(`/api/admin/password-reset-requests/${id}/approve`, { method: 'PATCH' });
    alert(result.message || 'Password reset approved.');
    await loadPasswordResetRequests();
    await loadUsers();
  } catch (err) { alert(err.message); }
}

async function declinePasswordReset(id) {
  const request = passwordRequestsCache.find(r => Number(r.id) === Number(id));
  const note = prompt(`Decline password reset request for ${request ? request.name : 'this account'}? Optional note:`, '');
  if (note === null) return;
  try {
    const result = await api(`/api/admin/password-reset-requests/${id}/decline`, { method: 'PATCH', body: JSON.stringify({ note }) });
    alert(result.message || 'Password reset request declined.');
    await loadPasswordResetRequests();
  } catch (err) { alert(err.message); }
}

async function approveSignup(id) {
  const request = signupRequestsCache.find(r => Number(r.id) === Number(id));
  if (!confirm(`Approve ${request ? request.name : 'this merchandiser'} account request?`)) return;
  try {
    const result = await api(`/api/admin/signup-requests/${id}/approve`, { method: 'PATCH' });
    alert(result.message || 'Signup request approved.');
    await loadSignupRequests();
    await loadUsers();
    await loadStores();
  } catch (err) { alert(err.message); }
}

async function declineSignup(id) {
  const request = signupRequestsCache.find(r => Number(r.id) === Number(id));
  const note = prompt(`Decline ${request ? request.name : 'this merchandiser'} account request? Optional note:`, '');
  if (note === null) return;
  try {
    const result = await api(`/api/admin/signup-requests/${id}/decline`, { method: 'PATCH', body: JSON.stringify({ note }) });
    alert(result.message || 'Signup request declined.');
    await loadSignupRequests();
  } catch (err) { alert(err.message); }
}


async function loadStores() {
  const data = await api('/api/admin/stores');
  storesCache = data.stores;
  statStores.textContent = data.stores.filter(s => s.active).length;

  const activeStores = data.stores.filter(s => s.active);
  const groups = [...new Set(activeStores.map(s => s.store_group || 'General'))].sort();
  const groupedOpts = activeStores.map(s => `<option value="${s.id}">${escapeHtml(s.store_group || 'General')} / ${escapeHtml(s.name)}</option>`).join('');
  workerStoreSelect.innerHTML = `<option value="">No store</option>${groupedOpts}`;

  const groupOptions = `<option value="">All location groups</option>${groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}`;
  const storeOptions = `<option value="">All stores</option>${groupedOpts}`;
  const mallSuggestionValues = [...new Set(['OASIS MALL', 'Dubai Mall', 'City Centre Deira', 'Mall of the Emirates', ...groups])];
  const storeSuggestionValues = [...new Set(['Emax', 'Sharaf DG', 'Carrefour', ...activeStores.map(s => s.name).filter(Boolean)])];
  const mallSuggestions = document.getElementById('mallSuggestions');
  const storeNameSuggestions = document.getElementById('storeNameSuggestions');
  if (mallSuggestions) mallSuggestions.innerHTML = mallSuggestionValues.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  if (storeNameSuggestions) storeNameSuggestions.innerHTML = storeSuggestionValues.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  if (userGroupFilter) userGroupFilter.innerHTML = groupOptions;
  if (attendanceGroupFilter) attendanceGroupFilter.innerHTML = groupOptions;
  if (userStoreFilter) userStoreFilter.innerHTML = storeOptions;
  if (attendanceStoreFilter) attendanceStoreFilter.innerHTML = storeOptions;

  let currentGroup = null;
  const rows = [];
  for (const s of data.stores) {
    const group = s.store_group || 'General';
    if (group !== currentGroup) {
      rows.push(`<tr class="group-row"><td colspan="8">${escapeHtml(group)}</td></tr>`);
      currentGroup = group;
    }
    const captured = Number(s.location_locked);
    const locText = captured ? `${Number(s.latitude).toFixed(5)}, ${Number(s.longitude).toFixed(5)}<br><span class="muted">Captured: ${fmtDate(s.location_captured_at)}</span>` : '<span class="badge warn">Pending first merchandiser check-in</span>';
    rows.push(`
      <tr>
        <td>${escapeHtml(group)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.code)}</td>
        <td>${locText}</td>
        <td>${s.radius_m || 500}m</td>
        <td>${escapeHtml(s.opening_time)} - ${escapeHtml(s.closing_time)}</td>
        <td><span class="badge ${s.active ? 'ok' : 'bad'}">${s.active ? 'Active' : 'Inactive'}</span></td>
        <td>${s.active ? `<button class="small danger" onclick="deactivateStore(${s.id})">Remove</button>` : ''}</td>
      </tr>
    `);
  }
  storesRows.innerHTML = rows.join('') || '<tr><td colspan="8">No stores.</td></tr>';
}

async function loadProducts() {
  const data = await api('/api/admin/products');
  statProducts.textContent = data.products.filter(p => p.active).length;
  productsRows.innerHTML = data.products.map(p => `
    <tr>
      <td>${escapeHtml(p.model)}</td>
      <td>${escapeHtml(p.category || '-')}</td>
      <td><input style="width:110px" type="number" step="0.01" value="${Number(p.default_price || 0)}" onchange="updateProduct(${p.id}, {default_price: this.value})"></td>
      <td><input style="width:80px" type="number" value="${Number(p.display_order || 0)}" onchange="updateProduct(${p.id}, {display_order: this.value})"></td>
      <td><span class="badge ${p.active ? 'ok' : 'bad'}">${p.active ? 'Active' : 'Inactive'}</span></td>
      <td><button class="small danger" onclick="deleteProduct(${p.id})">Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">No products.</td></tr>';
}

function faceBadgeClass(status) {
  if (status === 'approved') return 'ok';
  if (status === 'rejected' || status === 'expired') return 'bad';
  return 'warn';
}
function faceLabel(status) {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
function selfieCell(path, id, type, status) {
  const current = status || 'pending';
  const view = path ? `<a class="small" target="_blank" href="${path}">View Photo</a>` : '<span class="muted">No photo</span>';
  const controls = path ? `<div class="toolbar" style="margin-top:8px"><button class="small" onclick="updateFaceReview(${id}, '${type}', 'approved')">Approve</button><button class="small danger" onclick="updateFaceReview(${id}, '${type}', 'rejected')">Reject</button></div>` : '';
  return `${view}<br><span class="badge ${faceBadgeClass(current)}">${faceLabel(current)}</span>${controls}`;
}
function manualReviewCell(r) {
  const inStatus = r.in_face_review_status || 'pending';
  const outStatus = r.out_face_review_status || (r.check_out_time ? 'pending' : null);
  return `<span class="badge ${faceBadgeClass(inStatus)}">IN: ${faceLabel(inStatus)}</span><br>` +
    `<span class="badge ${faceBadgeClass(outStatus)}">OUT: ${outStatus ? faceLabel(outStatus) : '-'}</span>` +
    `${r.face_review_notes ? `<br><span class="muted">${escapeHtml(r.face_review_notes).replace(/\n/g, '<br>')}</span>` : ''}`;
}
function locationCell(r) {
  const inWarn = Number(r.in_location_warning || 0);
  const outWarn = Number(r.out_location_warning || 0);
  const inText = `${r.in_location_status || '-'}${r.check_in_distance_m !== null && r.check_in_distance_m !== undefined ? ` (${r.check_in_distance_m}m)` : ''}`;
  const outText = r.check_out_time ? `${r.out_location_status || '-'}${r.check_out_distance_m !== null && r.check_out_distance_m !== undefined ? ` (${r.check_out_distance_m}m)` : ''}` : '-';
  return `<span class="badge ${inWarn ? 'bad' : 'ok'}">IN: ${escapeHtml(inText)}</span><br><span class="badge ${outWarn ? 'bad' : 'ok'}">OUT: ${escapeHtml(outText)}</span>`;
}

async function loadAttendance() {
  const data = await api('/api/admin/attendance');
  attendanceCache = data.attendance;
  statAttendance.textContent = data.attendance.length;
  renderAttendance();
}

function renderAttendance() {
  const q = (attendanceSearchFilter?.value || '').trim().toLowerCase();
  const group = attendanceGroupFilter?.value || '';
  const storeId = attendanceStoreFilter?.value || '';
  const filtered = attendanceCache.filter(r => {
    const hay = [r.worker_name, r.employee_code, r.store_group, r.store_name, r.status].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (group && (r.store_group || 'General') !== group) return false;
    if (storeId && String(r.store_id || '') !== String(storeId)) return false;
    return true;
  });
  adminAttendanceRows.innerHTML = filtered.map(r => `
    <tr>
      <td>${escapeHtml(r.worker_name)}<br><span class="muted">${escapeHtml(r.employee_code || '')}</span></td>
      <td>${escapeHtml(r.store_group || '-')}</td>
      <td>${escapeHtml(r.store_name)}</td>
      <td>${fmtDate(r.check_in_time)}</td>
      <td>${fmtDate(r.check_out_time)}</td>
      <td>${fmtMinutes(r.total_work_minutes)}</td>
      <td>${r.total_customers ?? '-'}</td>
      <td>${r.converted_customers ?? '-'}</td>
      <td>${r.total_qty ?? '-'}</td>
      <td>${Number(r.total_value || 0).toFixed(2)}</td>
      <td>${r.no_sale_reason ? `<span class="muted">${escapeHtml(r.no_sale_reason)}</span>` : '-'}</td>
      <td>${selfieCell(r.in_face_image_path, r.id, 'in', r.in_face_review_status)}</td>
      <td>${selfieCell(r.out_face_image_path, r.id, 'out', r.out_face_review_status)}</td>
      <td>${locationCell(r)}</td>
      <td>${manualReviewCell(r)}</td>
      <td><span class="badge ${r.status === 'closed' ? 'ok' : 'warn'}">${escapeHtml(r.status)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="16">No attendance records match this filter.</td></tr>';
}

async function loadReports() {
  const data = await api('/api/admin/reports/monthly');
  adminReportRows.innerHTML = data.reports.map(r => `
    <tr>
      <td>${escapeHtml(r.report_id)}</td>
      <td>${escapeHtml(r.worker_name)}<br><span class="muted">${escapeHtml(r.employee_code || '')}</span></td>
      <td>${fmtMonth(r.month, r.year)}</td>
      <td>${r.total_present_days}</td>
      <td>${r.total_absent_days}</td>
      <td>${fmtMinutes(r.total_work_minutes)}</td>
      <td>${r.total_sales_qty}</td>
      <td>${Number(r.total_sales_value || 0).toFixed(2)}</td>
      <td><span class="badge ${Number(r.location_warning_count || 0) ? 'bad' : 'ok'}">${Number(r.location_warning_count || 0)}</span></td>
      <td><button class="small" onclick="downloadReport('${r.report_id}')">PDF</button></td>
      <td><a target="_blank" href="/verify-report/${encodeURIComponent(r.report_id)}">Verify</a></td>
    </tr>
  `).join('') || '<tr><td colspan="11">No reports generated yet.</td></tr>';
}

workerForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = formToObject(workerForm);
    if (!payload.assigned_store_id) delete payload.assigned_store_id;
    const file = newUserProfilePhoto.files[0];
    if (file) payload.profile_image = await fileToDataUrl(file);
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
    workerForm.reset();
    await loadUsers();
    alert('User created.');
  } catch (err) { alert(err.message); }
});

storeForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = formToObject(storeForm);
    await api('/api/admin/stores', { method: 'POST', body: JSON.stringify(payload) });
    storeForm.reset();
    storeForm.store_group.value = '';
    storeForm.radius_m.value = 500;
    storeForm.opening_time.value = '10:00';
    storeForm.closing_time.value = '22:00';
    await loadStores();
    alert('Store added. Location will be captured automatically from first merchandiser check-in.');
  } catch (err) { alert(err.message); }
});

productForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = formToObject(productForm);
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
    productForm.reset();
    await loadProducts();
    alert('Product added.');
  } catch (err) { alert(err.message); }
});

async function updateProduct(id, patch) {
  try {
    await api(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await loadProducts();
  } catch (err) { alert(err.message); }
}
async function deleteProduct(id) {
  const row = [...document.querySelectorAll('#productsRows tr')].find(tr => tr.querySelector(`button[onclick="deleteProduct(${id})"]`));
  const productName = row ? row.children[0]?.textContent?.trim() : 'this product';
  const typed = prompt(`This will permanently delete ${productName} from the server and dashboard. Existing sales report history will keep the saved product name/value snapshot.

To continue, please write exactly: Confirm`);
  if (typed === null) return;
  if (String(typed || '').trim().toLowerCase() !== 'confirm') {
    alert('Deletion not confirmed. Please type Confirm to continue.');
    return;
  }
  try {
    const result = await api(`/api/admin/products/${id}`, { method: 'DELETE' });
    alert(result.message || 'Product permanently deleted.');
    await loadProducts();
  } catch (err) { alert(err.message); }
}
async function deactivateUser(id) {
  const user = usersCache.find(u => Number(u.id) === Number(id));
  const name = user ? `${user.name} (${user.employee_code || user.email})` : 'this user';
  const typed = prompt(`This will permanently delete ${name} and all linked data.

To continue, please write exactly: Confirm`);
  if (typed === null) return;
  if (String(typed || '').trim().toLowerCase() !== 'confirm') {
    alert('Deletion not confirmed. Please type Confirm to continue.');
    return;
  }
  try {
    const result = await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    alert(result.message || 'User permanently deleted.');
    await loadUsers();
    await loadAttendance();
    await loadWorkStatus();
    await loadReports();
  } catch (err) { alert(err.message); }
}
async function deactivateStore(id) {
  const store = storesCache.find(s => Number(s.id) === Number(id));
  const name = store ? `${store.store_group || 'General'} / ${store.name} (${store.code})` : 'this store';
  const typed = prompt(`This will permanently delete ${name} and all linked store attendance/sales data.

To continue, please write exactly: Confirm`);
  if (typed === null) return;
  if (String(typed || '').trim().toLowerCase() !== 'confirm') {
    alert('Deletion not confirmed. Please type Confirm to continue.');
    return;
  }
  try {
    const result = await api(`/api/admin/stores/${id}`, { method: 'DELETE' });
    alert(result.message || 'Store permanently deleted.');
    await loadStores();
    await loadUsers();
    await loadAttendance();
    await loadWorkStatus();
    await loadReports();
  } catch (err) { alert(err.message); }
}
async function updateFaceReview(id, checkType, status) {
  const note = status === 'rejected' ? prompt('Optional rejection note:', '') : '';
  try {
    await api(`/api/admin/attendance/${id}/face-review`, { method: 'PATCH', body: JSON.stringify({ check_type: checkType, status, note }) });
    await loadAttendance();
  } catch (err) { alert(err.message); }
}
async function generateReports() {
  try {
    const month = Number(reportMonth.value);
    const year = Number(reportYear.value);
    if (!month || !year) return alert('Month and year are required.');
    const data = await api('/api/admin/reports/monthly/generate', { method: 'POST', body: JSON.stringify({ month, year }) });
    alert(`Generated ${data.reports.length} report(s).`);
    await loadReports();
  } catch (err) { alert(err.message); }
}

for (const el of [userSearchFilter, userGroupFilter, userStoreFilter]) {
  if (el) el.addEventListener('input', renderUsers);
  if (el) el.addEventListener('change', renderUsers);
}
for (const el of [attendanceSearchFilter, attendanceGroupFilter, attendanceStoreFilter]) {
  if (el) el.addEventListener('input', renderAttendance);
  if (el) el.addEventListener('change', renderAttendance);
}

bootAdmin().catch(err => alert(err.message));
