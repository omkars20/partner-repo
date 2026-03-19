/* ── Ops Dashboard — JavaScript ─────────────────────────────────── */

const API = '';
let dashboardData = { partners: [], counts: {} };
let currentDetailPartner = null;

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

// ── CSV Upload ──────────────────────────────────────────────────────

const uploadZone = document.getElementById('upload-zone');
const csvInput = document.getElementById('csv-file-input');

uploadZone.addEventListener('click', () => csvInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        uploadCSV(file);
    } else {
        showToast('Please drop a .csv file', 'error');
    }
});

csvInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadCSV(e.target.files[0]);
});

async function uploadCSV(file) {
    const statusEl = document.getElementById('upload-status');
    const resultEl = document.getElementById('upload-result');
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API}/api/upload-csv`, { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Upload failed');
        }

        const data = await res.json();

        // Build assignment summary
        let assignmentHtml = '';
        if (data.assignments) {
            assignmentHtml = '<div style="margin-top:12px;"><strong>Auto-assigned:</strong><ul style="margin:8px 0 0 20px; color:var(--text-secondary);">';
            for (const [code, info] of Object.entries(data.assignments)) {
                assignmentHtml += `<li><strong>${code}</strong> (${info.name}) → ${info.count} devices</li>`;
            }
            assignmentHtml += '</ul></div>';
        }

        resultEl.innerHTML = `
            <div style="padding:16px; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); border-radius:var(--radius-sm); color:var(--accent-green);">
                <strong>${data.message}</strong> — ${data.partners_imported} partners, ${data.devices_imported} devices.
                ${assignmentHtml}
            </div>
        `;
        resultEl.classList.remove('hidden');
        showToast('CSV uploaded & devices assigned!', 'success');

        await loadDashboard();
    } catch (err) {
        resultEl.innerHTML = `
            <div style="padding:16px; background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); border-radius:var(--radius-sm); color:var(--accent-red);">
                <strong>Error:</strong> ${err.message}
            </div>
        `;
        resultEl.classList.remove('hidden');
        showToast(err.message, 'error');
    } finally {
        statusEl.classList.add('hidden');
    }
}

// ── Dashboard Data ──────────────────────────────────────────────────

async function loadDashboard() {
    try {
        const res = await fetch(`${API}/api/ops/dashboard`);
        dashboardData = await res.json();
        renderStats();
        renderPartnerTable();
    } catch (err) {
        showToast('Failed to load dashboard data', 'error');
    }
}

function renderStats() {
    const c = dashboardData.counts;
    animateNumber('stat-partners', c.total_partners || 0);
    animateNumber('stat-total', c.total_devices || 0);
    animateNumber('stat-installed', c.installed || 0);
    animateNumber('stat-ocr-verified', c.ocr_verified || 0);
    animateNumber('stat-unaccounted', c.unaccounted || 0);
}

function animateNumber(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function getPartnerStatusBadge(p) {
    if (p.verification_started_at) {
        const ocrDone = p.ocr_verified || 0;
        const unaccounted = p.unaccounted || 0;
        const hasReason = p.has_reason || 0;

        if (unaccounted === 0 && ocrDone > 0) {
            return '<span class="badge badge-verified">Completed</span>';
        }
        if (hasReason > 0) {
            return '<span class="badge" style="background:rgba(251,191,36,0.15); color:var(--accent-yellow); border:1px solid rgba(251,191,36,0.3);">Reasons Submitted</span>';
        }
        return '<span class="badge" style="background:rgba(0,212,255,0.15); color:var(--accent-cyan); border:1px solid rgba(0,212,255,0.3);">In Progress</span>';
    }
    if (p.last_login_at) {
        return '<span class="badge badge-pending">Logged In</span>';
    }
    return '<span class="badge badge-missing">Not Started</span>';
}

function renderPartnerTable(filter = '') {
    const tbody = document.getElementById('partner-table-body');
    const partners = dashboardData.partners.filter(p =>
        !filter ||
        p.partner_code.toLowerCase().includes(filter) ||
        p.partner_name.toLowerCase().includes(filter) ||
        (p.city || '').toLowerCase().includes(filter)
    );

    if (partners.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:40px; color:var(--text-muted);">
            ${filter ? 'No partners match your search.' : 'Upload a CSV to auto-assign devices to partners.'}
        </td></tr>`;
        return;
    }

    tbody.innerHTML = partners.map(p => {
        const total = p.total_devices || 0;
        const installed = p.installed || 0;
        const ocrVerified = p.ocr_verified || 0;
        const unaccounted = p.unaccounted || 0;

        return `<tr>
            <td>
                <strong>${p.partner_code}</strong>
                <div style="color:var(--text-muted); font-size:0.8rem;">${p.partner_name}</div>
            </td>
            <td>${p.city || '—'}</td>
            <td>${total}</td>
            <td><span style="color:var(--accent-green); font-weight:600;">${installed}</span></td>
            <td><span style="color:var(--accent-cyan); font-weight:600;">${ocrVerified}</span></td>
            <td><span style="color:var(--accent-red); font-weight:600;">${unaccounted}</span></td>
            <td>${getPartnerStatusBadge(p)}</td>
            <td>
                <button class="btn btn-outline btn-sm" style="padding:6px 12px; font-size:0.8rem;" onclick="openDetail('${p.partner_code}')">
                    View
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── Search ──────────────────────────────────────────────────────────

document.getElementById('partner-search').addEventListener('input', (e) => {
    renderPartnerTable(e.target.value.toLowerCase().trim());
});

// ── Refresh ─────────────────────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', async () => {
    await loadDashboard();
    showToast('Dashboard refreshed', 'info');
});

// ── Export All ───────────────────────────────────────────────────────

document.getElementById('export-all-btn').addEventListener('click', () => {
    window.location.href = `${API}/api/ops/export-all`;
});

// ── Partner Detail Modal ────────────────────────────────────────────

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr + 'Z').toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

async function openDetail(partnerCode) {
    currentDetailPartner = partnerCode;

    try {
        const res = await fetch(`${API}/api/ops/partner/${partnerCode}`);
        const data = await res.json();
        const partner = data.partner;

        document.getElementById('detail-modal-title').textContent =
            `${partner.partner_name} — ${partnerCode}`;

        // Partner activity info
        document.getElementById('partner-activity-info').innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Assigned</div>
                    <div style="color:var(--text-primary); font-weight:600;">${formatDate(partner.assigned_at)}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Last Login</div>
                    <div style="color:${partner.last_login_at ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:600;">
                        ${partner.last_login_at ? formatDate(partner.last_login_at) : 'Never'}
                    </div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">Verification Started</div>
                    <div style="color:${partner.verification_started_at ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:600;">
                        ${partner.verification_started_at ? formatDate(partner.verification_started_at) : 'Not Yet'}
                    </div>
                </div>
            </div>
        `;

        const devices = data.devices;
        const installed = devices.filter(d => d.is_online).length;
        const ocrVerified = devices.filter(d => !d.is_online && d.ocr_matched).length;
        const unaccounted = devices.filter(d => !d.is_online && !d.ocr_matched).length;
        const withReason = devices.filter(d => !d.is_online && !d.ocr_matched && d.unverified_reason);

        document.getElementById('detail-stats').innerHTML = `
            <div class="stat-card yellow" style="padding:16px;">
                <div class="stat-number" style="font-size:1.8rem;">${devices.length}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-card green" style="padding:16px;">
                <div class="stat-number" style="font-size:1.8rem;">${installed}</div>
                <div class="stat-label">Installed</div>
            </div>
            <div class="stat-card blue" style="padding:16px;">
                <div class="stat-number" style="font-size:1.8rem;">${ocrVerified}</div>
                <div class="stat-label">OCR Verified</div>
            </div>
            <div class="stat-card red" style="padding:16px;">
                <div class="stat-number" style="font-size:1.8rem;">${unaccounted}</div>
                <div class="stat-label">Unaccounted</div>
            </div>
        `;

        // Reasons alert section
        const reasonSection = document.getElementById('reason-alert-section');
        if (withReason.length > 0) {
            reasonSection.style.display = '';
            const reasonGroups = {};
            withReason.forEach(d => {
                const r = d.unverified_reason;
                if (!reasonGroups[r]) reasonGroups[r] = [];
                reasonGroups[r].push(d.device_id);
            });

            let reasonHtml = `
                <div style="padding:16px; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:var(--radius-sm);">
                    <h4 style="color:var(--accent-yellow); margin-bottom:12px;">Partner Submitted Reasons (${withReason.length} devices)</h4>
            `;
            for (const [reason, ids] of Object.entries(reasonGroups)) {
                reasonHtml += `
                    <div style="margin-bottom:12px; padding:12px; background:rgba(0,0,0,0.2); border-radius:var(--radius-sm);">
                        <div style="color:var(--text-primary); font-weight:600; margin-bottom:6px;">"${reason}"</div>
                        <div style="color:var(--text-secondary); font-size:0.85rem;">
                            Devices: ${ids.map(id => `<span class="device-tag tag-reason" style="font-size:0.75rem; padding:2px 8px;">${id}</span>`).join(' ')}
                        </div>
                    </div>
                `;
            }
            reasonHtml += '</div>';
            reasonSection.innerHTML = reasonHtml;
        } else {
            reasonSection.style.display = 'none';
        }

        // Device table
        const tbody = document.getElementById('detail-table-body');
        tbody.innerHTML = devices.map(d => {
            let badge;
            if (d.is_online) {
                badge = '<span class="badge badge-verified">Installed</span>';
            } else if (d.ocr_matched) {
                badge = '<span class="badge" style="background:rgba(0,212,255,0.15); color:var(--accent-cyan); border:1px solid rgba(0,212,255,0.3);">OCR Verified</span>';
            } else if (d.unverified_reason) {
                badge = '<span class="badge" style="background:rgba(251,191,36,0.15); color:var(--accent-yellow); border:1px solid rgba(251,191,36,0.3);">Reason Given</span>';
            } else {
                badge = '<span class="badge badge-missing">Unaccounted</span>';
            }

            const photoLink = d.ocr_photo_path
                ? `<a href="${d.ocr_photo_path}" target="_blank" style="color:var(--accent-blue);">View</a>`
                : '—';

            const reasonCell = d.unverified_reason
                ? `<span style="color:var(--accent-yellow); font-size:0.85rem;">${d.unverified_reason}</span>`
                : '—';

            const customerCell = d.customer_name
                ? `<div style="font-size:0.85rem;">
                       <div style="font-weight:600;">${d.customer_name}</div>
                       <div style="color:var(--text-muted); font-size:0.78rem;">${d.customer_address}</div>
                       <div style="color:var(--accent-blue); font-size:0.78rem;">${d.customer_mobile}</div>
                   </div>`
                : '<span style="color:var(--text-muted);">—</span>';

            return `<tr>
                <td><strong style="font-family:monospace;">${d.device_id}</strong></td>
                <td>${badge}</td>
                <td>${customerCell}</td>
                <td>${photoLink}</td>
                <td>${d.ocr_matched_at ? formatDate(d.ocr_matched_at) : '—'}</td>
                <td>${reasonCell}</td>
            </tr>`;
        }).join('');

        document.getElementById('detail-modal').classList.remove('hidden');
    } catch (err) {
        showToast('Failed to load partner details', 'error');
    }
}

document.getElementById('detail-modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
});

// ── Run Ping from Dashboard ─────────────────────────────────────────

document.getElementById('run-ping-btn').addEventListener('click', async () => {
    if (!currentDetailPartner) return;

    try {
        const res = await fetch(`${API}/api/ping-check/${currentDetailPartner}`, { method: 'POST' });
        if (!res.ok) throw new Error('Ping failed');
        const data = await res.json();
        showToast(`Ping done: ${data.installed_count} installed, ${data.at_partner_count} at partner`, 'success');
        await openDetail(currentDetailPartner);
        await loadDashboard();
    } catch (err) {
        showToast('Ping check failed', 'error');
    }
});

// ── Export Partner ──────────────────────────────────────────────────

document.getElementById('export-partner-btn').addEventListener('click', () => {
    if (!currentDetailPartner) return;
    window.location.href = `${API}/api/ops/export/${currentDetailPartner}`;
});

// ── Initial Load ────────────────────────────────────────────────────

loadDashboard();
