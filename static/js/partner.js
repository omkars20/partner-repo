/* ── Partner Portal — JavaScript ────────────────────────────────── */

const API = '';
let currentPartnerCode = '';
let allDevices = [];

// ── Toast ──────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ── Login ──────────────────────────────────────────────────────────

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('partner-code-input').value.trim().toUpperCase();
    if (!code) return;

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Logging in…';

    try {
        const formData = new FormData();
        formData.append('partner_code', code);
        const res = await fetch(`${API}/api/partner/login`, { method: 'POST', body: formData });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Login failed');
        }

        const partner = await res.json();
        currentPartnerCode = partner.partner_code;

        // Show greeting
        document.getElementById('partner-greeting').textContent =
            `Welcome, ${partner.partner_name} (${partner.city || 'N/A'}) — Code: ${partner.partner_code}`;

        // Show assignment banner
        const assignedDate = partner.assigned_at
            ? new Date(partner.assigned_at + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A';
        document.getElementById('assignment-info').innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:8px;">
                <div><strong>Partner:</strong> ${partner.partner_name}</div>
                <div><strong>Location:</strong> ${partner.city || 'N/A'}</div>
                <div><strong>Devices Assigned:</strong> ${partner.total_devices}</div>
                <div><strong>Assigned On:</strong> ${assignedDate}</div>
            </div>
            <p style="margin-top:12px; color:var(--accent-yellow); font-size:0.9rem;">
                You have <strong>${partner.total_devices} devices</strong> assigned for verification.
                Please run the ping check and then upload photos of remaining devices.
            </p>
        `;

        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('main-section').classList.remove('hidden');
        showToast(`Welcome, ${partner.partner_name}!`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Login & View Devices';
    }
});

// ── Ping Check ────────────────────────────────────────────────────

document.getElementById('ping-btn').addEventListener('click', async () => {
    const btn = document.getElementById('ping-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Pinging devices…';

    try {
        const res = await fetch(`${API}/api/ping-check/${currentPartnerCode}`, { method: 'POST' });
        if (!res.ok) throw new Error('Ping check failed');

        const data = await res.json();

        document.getElementById('ping-result').classList.remove('hidden');
        document.getElementById('ping-result').innerHTML = `
            <div style="padding:16px; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); border-radius:var(--radius-sm); color:var(--accent-green);">
                Ping check complete! <strong>${data.installed_count}</strong> devices installed at customer homes,
                <strong>${data.at_partner_count}</strong> devices at your location need verification.
            </div>
        `;

        showToast(`Ping check done: ${data.installed_count} installed, ${data.at_partner_count} at your location`, 'success');

        await loadDevices();
        document.getElementById('stats-section').classList.remove('hidden');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Run Ping Check';
    }
});

// ── Load Devices ──────────────────────────────────────────────────

async function loadDevices() {
    const res = await fetch(`${API}/api/partner/${currentPartnerCode}/devices`);
    const data = await res.json();
    allDevices = data.devices;
    renderAll();
}

function deviceTooltip(d) {
    if (!d.customer_name) return '';
    const removedRow = d.connection_removed_at
        ? `<div class="tt-row"><span class="tt-label">Removed</span><span class="tt-value" style="color:var(--accent-red);">${d.connection_removed_at}</span></div>`
        : '';
    return `
        <div class="device-tooltip">
            <div class="tt-row"><span class="tt-label">Name</span><span class="tt-value">${d.customer_name}</span></div>
            <div class="tt-row"><span class="tt-label">Address</span><span class="tt-value">${d.customer_address}</span></div>
            <div class="tt-row"><span class="tt-label">Mobile</span><span class="tt-value">${d.customer_mobile}</span></div>
            ${removedRow}
        </div>`;
}

function deviceTagHtml(d, tagClass) {
    return `<div class="device-tag-wrap">
        <span class="device-tag ${tagClass}">${d.device_id}</span>
        ${deviceTooltip(d)}
    </div>`;
}

function renderAll() {
    const installed = allDevices.filter(d => d.is_online);
    const atPartner = allDevices.filter(d => !d.is_online);
    const ocrVerified = atPartner.filter(d => d.ocr_matched);
    const unaccounted = atPartner.filter(d => !d.ocr_matched && !d.unverified_reason);
    const withReason = atPartner.filter(d => !d.ocr_matched && d.unverified_reason);

    // Stats
    document.getElementById('stat-total').textContent = allDevices.length;
    document.getElementById('stat-installed').textContent = installed.length;
    document.getElementById('stat-at-partner').textContent = atPartner.length;
    document.getElementById('stat-ocr-verified').textContent = ocrVerified.length;
    document.getElementById('stat-unaccounted').textContent = unaccounted.length + withReason.length;

    // Installed devices
    document.getElementById('installed-list').innerHTML = installed.length
        ? installed.map(d => deviceTagHtml(d, 'tag-online')).join('')
        : '<p style="color:var(--text-muted);">No devices currently online.</p>';

    // Verified at partner (hover shows customer + removed date)
    document.getElementById('verified-list').innerHTML = ocrVerified.length
        ? ocrVerified.map(d => deviceTagHtml(d, 'tag-verified')).join('')
        : '<p style="color:var(--text-muted);">No devices verified yet. Upload a photo above.</p>';

    // Unverified at partner (hover shows customer + removed date)
    document.getElementById('unverified-list').innerHTML = unaccounted.length
        ? unaccounted.map(d => deviceTagHtml(d, 'tag-unverified')).join('')
        : '<p style="color:var(--accent-green); font-weight:600;">All devices accounted for!</p>';

    // Devices with reason submitted
    const reasonSection = document.getElementById('at-partner-with-reason');
    if (withReason.length > 0) {
        reasonSection.style.display = '';
        document.getElementById('reason-submitted-list').innerHTML = withReason.map(d => `
            <div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span class="device-tag tag-reason">${d.device_id}</span>
                <span style="color:var(--text-secondary); font-size:0.85rem;">"${d.unverified_reason}"</span>
            </div>
        `).join('');
    } else {
        reasonSection.style.display = 'none';
    }

    // Show/hide OCR section
    if (unaccounted.length === 0 && withReason.length === 0) {
        document.getElementById('ocr-section').style.display = 'none';
    } else {
        document.getElementById('ocr-section').style.display = '';
    }

    // Show/hide reason section with checkboxes
    const reasonSectionForm = document.getElementById('reason-section');
    if (unaccounted.length > 0) {
        reasonSectionForm.style.display = '';
        document.getElementById('unverified-device-checkboxes').innerHTML = `
            <div style="margin-bottom:8px; color:var(--text-secondary); font-size:0.9rem;">
                Select devices you want to provide a reason for:
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <input type="checkbox" id="select-all-unverified" style="width:16px; height:16px;">
                <label for="select-all-unverified" style="color:var(--text-secondary); font-size:0.85rem; cursor:pointer;">Select All</label>
            </div>
            <div class="device-tag-grid">
                ${unaccounted.map(d => `
                    <label class="device-checkbox-label">
                        <input type="checkbox" name="reason-device" value="${d.device_id}" class="reason-checkbox">
                        <span class="device-tag tag-unverified" style="cursor:pointer;">${d.device_id}</span>
                    </label>
                `).join('')}
            </div>
        `;
        // Select all handler
        document.getElementById('select-all-unverified').addEventListener('change', (e) => {
            document.querySelectorAll('.reason-checkbox').forEach(cb => cb.checked = e.target.checked);
        });
    } else {
        reasonSectionForm.style.display = 'none';
    }
}

// ── Photo Upload & OCR ────────────────────────────────────────────

const photoZone = document.getElementById('photo-upload-zone');
const photoInput = document.getElementById('ocr-photo-input');

photoZone.addEventListener('click', () => photoInput.click());

photoZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    photoZone.classList.add('dragover');
});

photoZone.addEventListener('dragleave', () => {
    photoZone.classList.remove('dragover');
});

photoZone.addEventListener('drop', (e) => {
    e.preventDefault();
    photoZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        uploadForOCR(file);
    } else {
        showToast('Please drop an image file', 'error');
    }
});

photoInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadForOCR(e.target.files[0]);
});

async function uploadForOCR(file) {
    const statusEl = document.getElementById('ocr-status');
    const resultEl = document.getElementById('ocr-result');
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    const formData = new FormData();
    formData.append('partner_code', currentPartnerCode);
    formData.append('photo', file);

    try {
        const res = await fetch(`${API}/api/partner/upload-photo`, { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'OCR failed');
        }

        const data = await res.json();

        // Build matched/unmatched display
        const matchedHtml = (data.matched_ids || []).map(id =>
            `<span class="device-tag tag-verified">${id}</span>`).join(' ');
        const unmatchedHtml = (data.unmatched_ocr_ids || []).map(id =>
            `<span class="device-tag tag-unverified" style="opacity:0.6;">${id}</span>`).join(' ');

        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `
            <div style="padding:16px; background:rgba(79,140,255,0.1); border:1px solid rgba(79,140,255,0.3); border-radius:var(--radius-sm);">
                <div style="color:var(--accent-blue); font-weight:600; margin-bottom:10px;">
                    OCR extracted ${data.extracted_ids.length} device ID(s) from photo
                </div>
                ${matchedHtml ? `<div style="margin-bottom:8px;">
                    <span style="color:var(--accent-green); font-size:0.85rem; font-weight:600;">Matched:</span> ${matchedHtml}
                </div>` : ''}
                ${unmatchedHtml ? `<div style="margin-bottom:8px;">
                    <span style="color:var(--text-muted); font-size:0.85rem;">Not in your inventory:</span> ${unmatchedHtml}
                </div>` : ''}
                ${data.extracted_ids.length === 0 ? `<div style="color:var(--accent-yellow); font-size:0.9rem;">
                    No device IDs could be read. Try a clearer photo with the device sticker visible.
                </div>` : ''}
                <div style="color:var(--text-secondary); font-size:0.9rem; margin-top:8px;">
                    <strong>${data.newly_matched}</strong> newly matched &bull;
                    <strong>${data.total_ocr_verified}</strong> total verified &bull;
                    <strong>${data.remaining_unverified}</strong> still remaining
                </div>
            </div>
        `;

        const matchMsg = data.newly_matched > 0
            ? `${data.newly_matched} device(s) matched from photo!`
            : data.extracted_ids.length > 0
                ? `Found ${data.extracted_ids.length} ID(s) but none matched your inventory`
                : 'No device IDs detected. Try a clearer photo.';
        showToast(matchMsg, data.newly_matched > 0 ? 'success' : 'info');
        await loadDevices();
        photoInput.value = '';
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        statusEl.classList.add('hidden');
    }
}

// ── Submit Reason for Unverified Devices ──────────────────────────

document.getElementById('submit-reason-btn').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.reason-checkbox:checked')].map(cb => cb.value);
    const reason = document.getElementById('reason-input').value.trim();

    if (checked.length === 0) {
        showToast('Please select at least one device', 'error');
        return;
    }
    if (!reason) {
        showToast('Please provide a reason', 'error');
        return;
    }

    const btn = document.getElementById('submit-reason-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Submitting…';

    try {
        const res = await fetch(`${API}/api/partner/submit-reason`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partner_code: currentPartnerCode,
                device_ids: checked,
                reason: reason,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to submit');
        }

        const data = await res.json();

        document.getElementById('reason-result').classList.remove('hidden');
        document.getElementById('reason-result').innerHTML = `
            <div style="padding:12px; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:var(--radius-sm); color:var(--accent-yellow);">
                Reason submitted for <strong>${data.updated_count}</strong> device(s). Admin has been notified.
            </div>
        `;

        showToast(`Reason submitted for ${data.updated_count} device(s)`, 'success');
        document.getElementById('reason-input').value = '';
        await loadDevices();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Reason';
    }
});
