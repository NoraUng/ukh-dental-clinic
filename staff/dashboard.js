// staff/dashboard.js
//
// Reads/updates appointments using the signed-in staff member's own
// Supabase session (anon key + their JWT). Every query goes through
// PostgREST, which enforces Row Level Security — this file has no elevated
// access of its own; is_staff() in 0002_rls_policies.sql is the real gate,
// and a trigger there additionally blocks any UPDATE except to `status`,
// so there's nothing here for this script to "trust" on its own.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_CONFIG = window.APP_CONFIG || {};
if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
  console.error(
    "APP_CONFIG is missing SUPABASE_URL/SUPABASE_ANON_KEY. Did you create ../config.js?",
  );
}

const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

const MAX_ROWS = 200;

const SERVICE_LABELS = {
  dental_cleaning_checkup: "Dental Cleaning & Checkup",
  tooth_filling: "Tooth Filling",
  teeth_whitening: "Teeth Whitening",
  root_canal_care: "Root Canal Care",
  braces_aligners: "Braces & Aligners",
  emergency_visit: "Emergency Visit",
};

const DOCTOR_LABELS = {
  dr_nory_ung: "Dr. Nory Ung",
  dr_muy_chem: "Dr. Muy Chem",
  no_preference: "No preference",
};

const STATUS_LABELS = {
  pending: "Pending",
  contacted: "Contacted",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const staffUserLabel = document.getElementById("staffUserLabel");
const signOutButton = document.getElementById("signOutButton");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const refreshButton = document.getElementById("refreshButton");
const dashboardSummary = document.getElementById("dashboardSummary");
const tableBody = document.getElementById("appointmentsTableBody");

let allAppointments = [];
let staffDisplayNames = new Map(); // user_id -> display_name
let expandedAppointmentId = null;
let auditCache = new Map(); // appointment_id -> audit rows

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

async function requireStaffSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.replace("./login.html");
    return null;
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("user_id, display_name, role")
    .eq("user_id", data.session.user.id)
    .maybeSingle();

  if (error || !profile) {
    await supabase.auth.signOut();
    window.location.replace("./login.html");
    return null;
  }

  staffUserLabel.textContent = `${profile.display_name} · ${data.session.user.email}`;
  return profile;
}

async function loadStaffDirectory() {
  const { data, error } = await supabase.from("staff_profiles").select("user_id, display_name");
  if (error) {
    console.error("Failed to load staff directory", error.message);
    return;
  }
  staffDisplayNames = new Map((data ?? []).map((row) => [row.user_id, row.display_name]));
}

function staffName(userId) {
  if (!userId) return "—";
  return staffDisplayNames.get(userId) ?? "Unknown staff";
}

async function loadAppointments() {
  tableBody.innerHTML = `<tr><td colspan="9" class="loading-state">Loading appointments…</td></tr>`;

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, reference_number, full_name, phone, email, patient_type, service, preferred_doctor, preferred_date, preferred_time, message, status, created_at, last_updated_by",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Could not load appointments: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allAppointments = data ?? [];
  renderTable();
}

function getFilteredAppointments() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  return allAppointments.filter((appointment) => {
    if (status !== "all" && appointment.status !== status) return false;
    if (!query) return true;

    const haystack = [
      appointment.full_name,
      appointment.phone,
      appointment.email,
      appointment.reference_number,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function renderTable() {
  const filtered = getFilteredAppointments();
  dashboardSummary.textContent = `${filtered.length} of ${allAppointments.length} appointment request(s) shown (most recent ${MAX_ROWS})`;

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-state">No appointment requests match your search/filter.</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";

  filtered.forEach((appointment) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(appointment.reference_number)}</strong></td>
      <td>${escapeHtml(appointment.full_name)}<br><small>${escapeHtml(
        appointment.patient_type === "new" ? "New patient" : "Returning patient",
      )}</small></td>
      <td>${escapeHtml(appointment.phone)}<br><small>${escapeHtml(appointment.email || "—")}</small></td>
      <td>${escapeHtml(SERVICE_LABELS[appointment.service] ?? appointment.service)}</td>
      <td>${escapeHtml(DOCTOR_LABELS[appointment.preferred_doctor] ?? appointment.preferred_doctor)}</td>
      <td>${escapeHtml(appointment.preferred_date)}<br><small>${escapeHtml(appointment.preferred_time)}</small></td>
      <td></td>
      <td>${escapeHtml(formatDateTime(appointment.created_at))}</td>
      <td><button type="button" class="link-button" data-action="toggle-detail">Details</button></td>
    `;

    const statusCell = row.children[6];
    const statusSelect = document.createElement("select");
    statusSelect.className = `status-select status-${appointment.status}`;
    statusSelect.setAttribute("aria-label", `Status for ${appointment.reference_number}`);
    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (value === appointment.status) option.selected = true;
      statusSelect.appendChild(option);
    });
    statusSelect.addEventListener("change", () => handleStatusChange(appointment, statusSelect));
    statusCell.appendChild(statusSelect);

    row.querySelector('[data-action="toggle-detail"]').addEventListener("click", () => {
      toggleDetailRow(appointment, row);
    });

    tableBody.appendChild(row);

    if (expandedAppointmentId === appointment.id) {
      tableBody.appendChild(buildDetailRow(appointment));
    }
  });
}

async function handleStatusChange(appointment, selectElement) {
  const previousStatus = appointment.status;
  const nextStatus = selectElement.value;

  selectElement.disabled = true;
  const { error } = await supabase
    .from("appointments")
    .update({ status: nextStatus })
    .eq("id", appointment.id);
  selectElement.disabled = false;

  if (error) {
    console.error("Status update failed", error.message);
    selectElement.value = previousStatus;
    window.alert(`Could not update status: ${error.message}`);
    return;
  }

  appointment.status = nextStatus;
  selectElement.className = `status-select status-${nextStatus}`;
  // Local cache of "who changed it" won't be accurate until reload, but the
  // audit log (fetched on demand) always reflects the real server record.
  auditCache.delete(appointment.id);
}

function toggleDetailRow(appointment, row) {
  expandedAppointmentId = expandedAppointmentId === appointment.id ? null : appointment.id;
  const existingDetail = row.nextElementSibling;
  if (existingDetail && existingDetail.classList.contains("detail-row")) {
    existingDetail.remove();
    return;
  }
  // Remove any other open detail row first.
  document.querySelectorAll(".detail-row").forEach((el) => el.remove());
  if (expandedAppointmentId === appointment.id) {
    row.after(buildDetailRow(appointment));
    loadAuditHistory(appointment.id);
  }
}

function buildDetailRow(appointment) {
  const detailRow = document.createElement("tr");
  detailRow.className = "detail-row";
  const cell = document.createElement("td");
  cell.colSpan = 9;
  cell.innerHTML = `
    <p><strong>Message from patient:</strong> ${
      appointment.message ? escapeHtml(appointment.message) : "<em>None provided</em>"
    }</p>
    <p style="margin-top:10px;"><strong>Last updated by:</strong> ${escapeHtml(staffName(appointment.last_updated_by))}</p>
    <p style="margin-top:14px;"><strong>Change history</strong></p>
    <ul class="audit-list" id="audit-${appointment.id}">
      <li>Loading…</li>
    </ul>
  `;
  detailRow.appendChild(cell);
  return detailRow;
}

async function loadAuditHistory(appointmentId) {
  const listElement = document.getElementById(`audit-${appointmentId}`);
  if (!listElement) return;

  if (auditCache.has(appointmentId)) {
    renderAuditHistory(listElement, auditCache.get(appointmentId));
    return;
  }

  const { data, error } = await supabase
    .from("appointment_audit_log")
    .select("field_changed, old_value, new_value, changed_by, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });

  if (error) {
    listElement.innerHTML = `<li>Could not load history: ${escapeHtml(error.message)}</li>`;
    return;
  }

  auditCache.set(appointmentId, data ?? []);
  renderAuditHistory(listElement, data ?? []);
}

function renderAuditHistory(listElement, rows) {
  if (rows.length === 0) {
    listElement.innerHTML = "<li>No changes recorded yet.</li>";
    return;
  }

  listElement.innerHTML = rows
    .map((row) => {
      const oldLabel = STATUS_LABELS[row.old_value] ?? row.old_value;
      const newLabel = STATUS_LABELS[row.new_value] ?? row.new_value;
      return `<li><strong>${escapeHtml(staffName(row.changed_by))}</strong> changed ${escapeHtml(
        row.field_changed,
      )} from "${escapeHtml(oldLabel)}" to "${escapeHtml(newLabel)}" — ${escapeHtml(
        formatDateTime(row.created_at),
      )}</li>`;
    })
    .join("");
}

let searchDebounceTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderTable, 150);
});
statusFilter.addEventListener("change", renderTable);
refreshButton.addEventListener("click", loadAppointments);

signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.replace("./login.html");
});

(async function start() {
  const profile = await requireStaffSession();
  if (!profile) return;
  await loadStaffDirectory();
  await loadAppointments();
})();
