guard('worker');
setupSections();

let stream = null;
let latestImage = null;
let latestLocation = null;
let products = [];
let meCache = null;

async function bootWorker() {
  const me = await api('/api/me');
  meCache = me.user;
  renderProfile(meCache);
  document.getElementById('faceBadge').textContent = 'Manual selfie review mode';
  document.getElementById('faceBadge').className = 'badge warn';
  await loadStores();
  await loadProducts();
  await loadOpenAttendance();
  await loadAttendance();
  await loadReports();
  setInterval(() => document.getElementById('logoutPreview').textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), 1000);
}

function renderProfile(u) {
  document.getElementById('welcomeText').textContent = `${u.name} | ${u.employee_code || u.email}`;
  dashboardAvatar.innerHTML = avatarHtml(u.profile_image_path, u.name);
  profileAvatar.innerHTML = avatarHtml(u.profile_image_path, u.name);
  dashboardName.textContent = u.name;
  dashboardStaffId.textContent = u.employee_code || u.email;
  profileName.textContent = u.name;
  profileStaffId.textContent = u.employee_code || u.email;
  profileRole.textContent = u.role === 'worker' ? 'Staff / Merchandiser' : u.role;
  locationWarningCount.textContent = u.location_warning_count || 0;
  profileWarnings.textContent = u.location_warning_count || 0;
  lastLoginText.textContent = fmtDate(u.last_login_at);
  lastLogoutText.textContent = fmtDate(u.last_logout_at);
}

async function uploadProfilePhoto() {
  try {
    const file = profilePhotoInput.files[0];
    if (!file) return alert('Please choose a profile picture first.');
    const image = await fileToDataUrl(file);
    await api('/api/profile/photo', { method: 'POST', body: JSON.stringify({ image }) });
    const me = await api('/api/me');
    meCache = me.user;
    localStorage.setItem('user', JSON.stringify(me.user));
    renderProfile(me.user);
    profilePhotoInput.value = '';
    alert('Profile picture updated.');
  } catch (err) { alert(err.message); }
}

async function loadStores() {
  const data = await api('/api/stores');
  storeSelect.innerHTML = data.stores.map(s => {
    const status = Number(s.location_locked) ? `${Number(s.radius_m || 500)}m range` : 'first check-in sets location';
    return `<option value="${s.id}">${escapeHtml(s.store_group || 'General')} / ${escapeHtml(s.name)} (${escapeHtml(s.code)}) - ${status}</option>`;
  }).join('');
}

async function loadProducts() {
  const data = await api('/api/products');
  products = data.products;
  salesItems.innerHTML = products.map(p => `
    <tr data-product-id="${p.id}">
      <td>${escapeHtml(p.model)}</td>
      <td><input class="qty" type="number" min="0" value="0" oninput="recalcSales()"></td>
      <td><input class="price" type="number" min="0" step="0.01" value="${Number(p.default_price || 0)}" oninput="recalcSales()"></td>
      <td class="amount value">0.00</td>
    </tr>
  `).join('');
  recalcSales();
}

function recalcSales() {
  let qty = 0, value = 0;
  document.querySelectorAll('#salesItems tr').forEach(tr => {
    const q = Math.max(0, Number(tr.querySelector('.qty').value || 0));
    const price = Math.max(0, Number(tr.querySelector('.price').value || 0));
    const rowValue = q * price;
    tr.querySelector('.value').textContent = rowValue.toFixed(2);
    qty += q;
    value += rowValue;
  });
  totalQty.textContent = qty;
  totalValue.textContent = value.toFixed(2);
  const customers = Math.max(0, Number(totalCustomers.value || 0));
  const converted = Math.max(0, Number(convertedCustomers.value || 0));
  conversionRate.textContent = customers ? `${((converted / customers) * 100).toFixed(2)}%` : '0%';
}

totalCustomers.addEventListener('input', recalcSales);
convertedCustomers.addEventListener('input', recalcSales);

async function loadOpenAttendance() {
  const data = await api('/api/worker/attendance/open');
  if (data.attendance) {
    currentStatus.textContent = 'Checked In';
    openAttendanceId.textContent = `#${data.attendance.id}`;
  } else {
    currentStatus.textContent = 'Not Checked In';
    openAttendanceId.textContent = 'None';
  }
}

function renderLocationStatus(r) {
  const inWarn = Number(r.in_location_warning || 0);
  const outWarn = Number(r.out_location_warning || 0);
  const inText = `${r.in_location_status || '-'}${r.check_in_distance_m !== null && r.check_in_distance_m !== undefined ? ` (${r.check_in_distance_m}m)` : ''}`;
  const outText = r.check_out_time ? `${r.out_location_status || '-'}${r.check_out_distance_m !== null && r.check_out_distance_m !== undefined ? ` (${r.check_out_distance_m}m)` : ''}` : '-';
  return `<span class="badge ${inWarn ? 'bad' : 'ok'}">IN: ${escapeHtml(inText)}</span><br><span class="badge ${outWarn ? 'bad' : 'ok'}">OUT: ${escapeHtml(outText)}</span>`;
}

async function loadAttendance() {
  const data = await api('/api/worker/attendance');
  const warningTotal = data.attendance.reduce((sum, r) => sum + Number(r.in_location_warning || 0) + Number(r.out_location_warning || 0), 0);
  locationWarningCount.textContent = warningTotal;
  profileWarnings.textContent = warningTotal;
  attendanceRows.innerHTML = data.attendance.map(r => `
    <tr>
      <td>${fmtDate(r.check_in_time)}</td>
      <td>${escapeHtml(r.store_group ? `${r.store_group} / ${r.store_name}` : r.store_name)}</td>
      <td>${fmtTime(r.check_in_time)}</td>
      <td>${fmtTime(r.check_out_time)}</td>
      <td>${fmtMinutes(r.total_work_minutes)}</td>
      <td>${r.total_qty ?? '-'}</td>
      <td>${Number(r.total_value || 0).toFixed(2)}</td>
      <td>${r.no_sale_reason ? `<span class="muted">${escapeHtml(r.no_sale_reason)}</span>` : '-'}</td>
      <td>${renderReviewStatus(r)}</td>
      <td>${renderLocationStatus(r)}</td>
      <td><span class="badge ${r.status === 'closed' ? 'ok' : 'warn'}">${escapeHtml(r.status)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="11">No attendance yet.</td></tr>';
}

async function loadReports() {
  const data = await api('/api/worker/reports/monthly');
  reportRows.innerHTML = data.reports.map(r => `
    <tr>
      <td>${escapeHtml(r.report_id)}</td>
      <td>${fmtMonth(r.month, r.year)}</td>
      <td>${r.total_present_days}</td>
      <td>${r.total_absent_days}</td>
      <td>${fmtMinutes(r.total_work_minutes)}</td>
      <td>${Number(r.total_sales_value || 0).toFixed(2)}</td>
      <td><span class="badge ${Number(r.location_warning_count || 0) ? 'bad' : 'ok'}">${Number(r.location_warning_count || 0)}</span></td>
      <td><button class="small" onclick="downloadReport('${r.report_id}')">PDF</button></td>
    </tr>
  `).join('') || '<tr><td colspan="8">No monthly reports generated yet.</td></tr>';
}

function badgeClass(status) {
  if (status === 'approved') return 'ok';
  if (status === 'rejected' || status === 'expired') return 'bad';
  return 'warn';
}
function reviewLabel(status) {
  if (!status) return '-';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
function renderReviewStatus(r) {
  const inStatus = r.in_face_review_status || 'pending';
  const outStatus = r.out_face_review_status || (r.check_out_time ? 'pending' : null);
  return `<span class="badge ${badgeClass(inStatus)}">IN: ${reviewLabel(inStatus)}</span><br>` +
    `<span class="badge ${badgeClass(outStatus)}">OUT: ${reviewLabel(outStatus)}</span>`;
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    camera.srcObject = stream;
  } catch (err) {
    alert('Camera permission failed: ' + err.message);
  }
}
async function captureSnapshot() {
  if (!stream) await startCamera();
  await new Promise(resolve => setTimeout(resolve, 250));
  const ctx = snapshot.getContext('2d');
  ctx.drawImage(camera, 0, 0, snapshot.width, snapshot.height);
  latestImage = snapshot.toDataURL('image/jpeg', 0.88);
  if ('FaceDetector' in window) {
    try {
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(snapshot);
      if (!faces.length) alert('No face detected by browser. Please retake the selfie with your face and store background visible.');
    } catch {}
  }
  return latestImage;
}
function getLocationNow() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(pos => {
      latestLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
      locationStatus.textContent = `${Math.round(pos.coords.accuracy)}m accuracy`;
      resolve(latestLocation);
    }, err => {
      locationStatus.textContent = 'Location failed';
      reject(err);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
async function ensureLocationAndImage() {
  const image = latestImage || await captureSnapshot();
  const loc = latestLocation || await getLocationNow();
  return { image, loc };
}
function showLocationResult(location) {
  if (!location) return;
  if (location.store_location_captured) {
    locationWarningBox.style.display = 'block';
    locationWarningBox.className = 'success-box';
    locationWarningBox.textContent = 'Store location captured automatically for future 0.5 KM validation.';
    return;
  }
  if (location.warning) {
    locationWarningBox.style.display = 'block';
    locationWarningBox.className = 'warning-box';
    locationWarningBox.textContent = `Warning: you are outside the 0.5 KM store range. Distance recorded: ${location.distance_m}m. Admin will see this warning.`;
  } else {
    locationWarningBox.style.display = 'none';
  }
}
async function refreshProfile() {
  const me = await api('/api/me');
  meCache = me.user;
  localStorage.setItem('user', JSON.stringify(me.user));
  renderProfile(me.user);
}
async function checkIn() {
  try {
    const { image, loc } = await ensureLocationAndImage();
    const data = await api('/api/attendance/check-in', { method: 'POST', body: JSON.stringify({ store_id: storeSelect.value, ...loc, image }) });
    showLocationResult(data.location);
    alert(data.location.warning ? `Checked in with location warning. Distance: ${data.location.distance_m}m.` : `Checked in successfully. Distance: ${data.location.distance_m}m.`);
    latestImage = null; latestLocation = null;
    await loadOpenAttendance(); await loadAttendance(); await refreshProfile(); await loadStores();
  } catch (err) { alert(err.message); }
}
function buildSalesItems() {
  return [...document.querySelectorAll('#salesItems tr')].map(tr => ({ product_id: Number(tr.dataset.productId), quantity: Number(tr.querySelector('.qty').value || 0), unit_price: Number(tr.querySelector('.price').value || 0) }));
}
let noSaleReasonResolver = null;
function askNoSaleReason() {
  return new Promise(resolve => {
    noSaleReasonResolver = resolve;
    noSaleReasonInput.value = '';
    noSaleModal.style.display = 'flex';
    setTimeout(() => noSaleReasonInput.focus(), 100);
  });
}
function submitNoSaleReason() {
  const reason = noSaleReasonInput.value.trim();
  if (!reason) return alert('Please write a short reason before submitting.');
  noSaleModal.style.display = 'none';
  noSaleReasonResolver?.(reason);
  noSaleReasonResolver = null;
}
function cancelNoSaleReason() {
  noSaleModal.style.display = 'none';
  noSaleReasonResolver?.(null);
  noSaleReasonResolver = null;
}
async function checkOut() {
  try {
    recalcSales();
    const items = buildSalesItems();
    const totalSoldQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    let noSaleReason = '';
    if (totalSoldQty === 0) {
      noSaleReason = await askNoSaleReason();
      if (!noSaleReason) return;
    }
    const { image, loc } = await ensureLocationAndImage();
    const payload = { ...loc, image, total_customers: Number(totalCustomers.value || 0), converted_customers: Number(convertedCustomers.value || 0), items, no_sale_reason: noSaleReason };
    const data = await api('/api/attendance/check-out', { method: 'POST', body: JSON.stringify(payload) });
    showLocationResult(data.location);
    alert(data.location.warning ? `Checked out with location warning. Distance: ${data.location.distance_m}m. Total value: ${Number(data.total_value).toFixed(2)}.` : `Checked out successfully. Total value: ${Number(data.total_value).toFixed(2)}. Work time: ${fmtMinutes(data.total_work_minutes)}.`);
    document.querySelectorAll('#salesItems .qty').forEach(i => i.value = 0);
    totalCustomers.value = 0; convertedCustomers.value = 0; latestImage = null; latestLocation = null; recalcSales();
    await loadOpenAttendance(); await loadAttendance(); await refreshProfile();
  } catch (err) { alert(err.message); }
}

bootWorker().catch(err => alert(err.message));
