
/* StudyFlow Supabase connection */
const SUPABASE_URL = "https://vpkqhxzzqdlqaqvioxbd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Gmho7VHOy9KRURyWFZRrLg_lyV238vM";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const STORAGE_KEY = "studyflow.assignments.v1";
const ACTIVITY_KEY = "studyflow.activity.v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const dateFromISO = value => value ? new Date(`${value}T12:00:00`) : null;
const formatDate = value => {
  const d = dateFromISO(value);
  return d ? d.toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"}) : "No date";
};
const shortDate = value => {
  const d = dateFromISO(value);
  return d ? {month:d.toLocaleDateString(undefined,{month:"short"}), day:d.getDate()} : {month:"—",day:"—"};
};
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function loadJSON(key, fallback) {
  try { const parsed = JSON.parse(localStorage.getItem(key)); return parsed ?? fallback; }
  catch { return fallback; }
}

let assignments = [];
let activities = loadJSON(ACTIVITY_KEY, []);
let toastTimer;

// Keep activity history in the browser, but not assignments.
function save() {
  localStorage.setItem(
    ACTIVITY_KEY,
    JSON.stringify(activities.slice(0, 12))
  );
}

function logActivity(message, type = "added") {
  activities.unshift({
    id: makeId(),
    message,
    type,
    at: new Date().toISOString()
  });
  activities = activities.slice(0, 12);
  save();
}

// Convert a database row to the format used by the dashboard.
function fromDatabase(row) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    dueDate: row.due_date,
    priority: row.priority || "Medium",
    status: row.completed ? "Completed" : "Pending",
    notes: row.notes || ""
  };
}

// Load only the signed-in user's assignments.
// Supabase RLS remains responsible for restricting access.
async function loadAssignmentsFromSupabase() {
  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData.user) {
    assignments = [];
    renderAll();
    return;
  }

  const { data, error } = await supabaseClient
    .from("assignments")
    .select("*")
    .order("due_date", { ascending: true });

  if (error) {
    assignments = [];
    renderAll();
    toast("Could not load assignments: " + error.message);
    return;
  }

  assignments = (data || []).map(fromDatabase);
  renderAll();
}

function isOverdue(task) { return task.status !== "Completed" && task.dueDate < todayISO(); }
function taskStatus(task) { return task.status === "Completed" ? "Completed" : isOverdue(task) ? "Overdue" : "Pending"; }
function statusClass(status) { return `status-${status.toLowerCase()}`; }
function priorityClass(priority) { return `priority-${priority.toLowerCase()}`; }
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}
function setView(view) {
  const known = ["dashboard","assignments","subjects","calendar"];
  if (!known.includes(view)) view = "dashboard";
  $$(".view").forEach(node => node.classList.toggle("active-view", node.id === `${view}View`));
  $$(".nav-item[data-view]").forEach(node => node.classList.toggle("active", node.dataset.view === view));
  $("#pageLabel").textContent = view[0].toUpperCase() + view.slice(1);
  $("#sidebar").classList.remove("mobile-open");
  if (view === "assignments") renderAssignments();
  if (view === "subjects") renderSubjectsPage();
  if (view === "calendar") renderCalendar();
  window.scrollTo({top:0, behavior:"smooth"});
}
function openDialog(task = null) {
  $("#assignmentForm").reset();
  $("#assignmentId").value = task?.id || "";
  $("#dialogTitle").textContent = task ? "Edit assignment" : "Add assignment";
  $("#titleInput").value = task?.title || "";
  $("#subjectInput").value = task?.subject || "";
  $("#dueInput").value = task?.dueDate || todayISO();
  $("#priorityInput").value = task?.priority || "Medium";
  $("#statusInput").value = task?.status || "Pending";
  $("#notesInput").value = task?.notes || "";
  $("#assignmentDialog").showModal();
  $("#titleInput").focus();
}
function closeDialog() { $("#assignmentDialog").close(); }
function getSubjects() {
  return [...new Set(assignments.map(a => a.subject.trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
}
function counts() {
  return {
    total: assignments.length,
    completed: assignments.filter(a => a.status === "Completed").length,
    overdue: assignments.filter(isOverdue).length,
    pending: assignments.filter(a => taskStatus(a) === "Pending").length
  };
}
function renderStats() {
  const c = counts();
  $("#totalStat").textContent = c.total;
  $("#pendingStat").textContent = c.pending;
  $("#completedStat").textContent = c.completed;
  $("#overdueStat").textContent = c.overdue;
  $("#navCount").textContent = c.pending;
  const percent = c.total ? Math.round(c.completed / c.total * 100) : 0;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressRing").style.setProperty("--progress", `${percent * 3.6}deg`);
  $("#progressFill").style.width = `${percent}%`;
  $("#progressCount").textContent = `${c.completed} of ${c.total}`;
  $("#progressMessage").textContent = c.total === 0 ? "Add your first assignment to start tracking progress." :
    percent === 100 ? "Amazing work — every assignment is complete!" :
    `${c.total - c.completed} assignment${c.total - c.completed === 1 ? "" : "s"} left to reach your goal. Keep going!`;
}
function taskDateTile(date) {
  const d = shortDate(date);
  return `<div class="date-tile"><span>${escapeHTML(d.month)}</span><strong>${escapeHTML(d.day)}</strong></div>`;
}
function taskRow(task) {
  const status = taskStatus(task);
  return `<div class="task-row">
    ${taskDateTile(task.dueDate)}
    <div><div class="task-title">${escapeHTML(task.title)}</div><div class="task-meta">${escapeHTML(task.subject)} · ${escapeHTML(task.priority)} priority</div></div>
    <span class="status-pill ${statusClass(status)}">${status}</span>
  </div>`;
}
function renderUpcoming() {
  const upcoming = assignments.filter(a => a.status !== "Completed")
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,4);
  $("#upcomingList").innerHTML = upcoming.length ? upcoming.map(taskRow).join("") :
    `<div class="empty-state"><span>✓</span><h3>You're all caught up</h3><p>Add an assignment whenever you're ready.</p></div>`;
}
function subjectStats() {
  return getSubjects().map(subject => {
    const tasks = assignments.filter(a => a.subject === subject);
    const done = tasks.filter(a => a.status === "Completed").length;
    return {subject, total:tasks.length, done, percent:tasks.length ? Math.round(done/tasks.length*100) : 0};
  });
}
function renderSubjectOverview() {
  const icons = ["▦","⌘","▤","✧","◉","▧"];
  const list = subjectStats().slice(0,4);
  $("#subjectOverview").innerHTML = list.length ? list.map((s,i) => `<article class="subject-mini">
    <div class="subject-mini-top"><span class="subject-icon">${icons[i%icons.length]}</span><strong>${escapeHTML(s.subject)}</strong></div>
    <div class="subject-count">${s.done} of ${s.total} completed</div>
    <div class="mini-track"><div class="mini-fill" style="width:${s.percent}%"></div></div>
    <div class="subject-percent">${s.percent}%</div>
  </article>`).join("") : `<p class="muted small">Your subject overview will appear here after you add assignments.</p>`;
}
function renderActivity() {
  $("#activityList").innerHTML = activities.length ? activities.slice(0,5).map(a => {
    const date = new Date(a.at);
    const when = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
    const symbol = a.type === "warning" ? "!" : a.type === "completed" ? "✓" : a.type === "added" ? "+" : "↻";
    return `<div class="activity-item"><span class="activity-symbol ${escapeHTML(a.type)}">${symbol}</span><div><strong>${escapeHTML(a.message)}</strong><p>${escapeHTML(when)}</p></div></div>`;
  }).join("") : `<p class="muted small">Your recent changes will appear here.</p>`;
}
function renderDashboard() {
  renderStats(); renderUpcoming(); renderSubjectOverview(); renderActivity(); updateSubjectFilter();
}
function updateSubjectFilter() {
  const select = $("#subjectFilter");
  if (!select) return;
  const current = select.value || "all";
  const options = getSubjects().map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
  select.innerHTML = `<option value="all">All subjects</option>${options}`;
  select.value = [...select.options].some(o => o.value === current) ? current : "all";
}
function renderAssignments() {
  updateSubjectFilter();
  const query = ($("#searchInput")?.value || "").trim().toLowerCase();
  const status = $("#statusFilter")?.value || "all";
  const subject = $("#subjectFilter")?.value || "all";
  const filtered = assignments.filter(a => {
    const matchesQuery = `${a.title} ${a.subject} ${a.notes || ""}`.toLowerCase().includes(query);
    const matchesStatus = status === "all" || taskStatus(a).toLowerCase() === status;
    return matchesQuery && matchesStatus && (subject === "all" || a.subject === subject);
  }).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  $("#assignmentTable").innerHTML = filtered.map(a => {
    const currentStatus = taskStatus(a);
    return `<tr>
      <td><div class="table-title">${escapeHTML(a.title)}</div>${a.notes ? `<div class="table-sub">${escapeHTML(a.notes)}</div>` : ""}</td>
      <td>${escapeHTML(a.subject)}</td><td>${escapeHTML(formatDate(a.dueDate))}</td>
      <td><span class="priority-pill ${priorityClass(a.priority)}">${escapeHTML(a.priority)}</span></td>
      <td><span class="status-pill ${statusClass(currentStatus)}">${currentStatus}</span></td>
      <td>${a.status !== "Completed" ? `<button class="row-action" data-action="complete" data-id="${escapeHTML(a.id)}" title="Mark completed">✓</button>` : ""}
      <button class="row-action" data-action="edit" data-id="${escapeHTML(a.id)}" title="Edit assignment">Edit</button>
      <button class="row-action" data-action="delete" data-id="${escapeHTML(a.id)}" title="Delete assignment">Delete</button></td>
    </tr>`;
  }).join("");
  $("#emptyAssignments").classList.toggle("hidden", filtered.length > 0);
  $("#assignmentTable").closest("table").classList.toggle("hidden", filtered.length === 0);
}
function renderSubjectsPage() {
  const list = subjectStats();
  const icons = ["▦","⌘","▤","✧","◉","▧"];
  $("#subjectsPageGrid").innerHTML = list.length ? list.map((s,i) => `<article class="subject-large">
    <div class="subject-mini-top"><span class="subject-icon">${icons[i%icons.length]}</span><span class="status-pill status-pending">${s.total} task${s.total===1?"":"s"}</span></div>
    <h3>${escapeHTML(s.subject)}</h3><p class="muted">${s.done} completed · ${s.total-s.done} remaining</p>
    <div class="progress-track"><div class="progress-fill" style="width:${s.percent}%"></div></div>
    <div class="subject-large-footer"><span>Completion</span><strong>${s.percent}%</strong></div>
  </article>`).join("") : `<section class="panel"><div class="empty-state"><span>▧</span><h3>No subjects yet</h3><p>Add an assignment and enter a subject to see your subject summary.</p><button class="primary-button" id="subjectsAdd">＋ Add assignment</button></div></section>`;
  $("#subjectsAdd")?.addEventListener("click", () => openDialog());
}
function renderCalendar() {
  const list = [...assignments].sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  if (!list.length) {
    $("#calendarList").innerHTML = `<div class="empty-state"><span>▦</span><h3>Your calendar is clear</h3><p>Add assignments to see your deadlines here.</p><button class="primary-button" id="calendarEmptyAdd">＋ Add assignment</button></div>`;
    $("#calendarEmptyAdd")?.addEventListener("click", () => openDialog());
    return;
  }
  const groups = list.reduce((acc, task) => ((acc[task.dueDate] ||= []).push(task),acc),{});
  $("#calendarList").innerHTML = Object.entries(groups).map(([date,tasks]) => `<div class="calendar-day"><div class="calendar-date-heading">${escapeHTML(formatDate(date))}${date < todayISO() ? " · Past due date" : date === todayISO() ? " · Today" : ""}</div>
    ${tasks.map(task => `<div class="calendar-event"><span class="event-dot" style="background:${task.status==="Completed"?"var(--green)":isOverdue(task)?"var(--red)":"var(--blue)"}"></span><div class="event-main"><strong>${escapeHTML(task.title)}</strong><p>${escapeHTML(task.subject)} · ${escapeHTML(task.priority)} priority</p></div><span class="status-pill ${statusClass(taskStatus(task))}">${taskStatus(task)}</span><button class="row-action" data-action="edit" data-id="${escapeHTML(task.id)}">Edit</button></div>`).join("")}</div>`).join("");
}
function renderAll() { renderDashboard(); renderAssignments(); if ($("#subjectsView").classList.contains("active-view")) renderSubjectsPage(); if ($("#calendarView").classList.contains("active-view")) renderCalendar(); }
function findTask(id) { return assignments.find(a => a.id === id); }


$("#assignmentForm").addEventListener("submit", async event => {
  event.preventDefault();

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData.user) {
    toast("Please log in before saving assignments.");
    return;
  }

  const user = authData.user;
  const id = $("#assignmentId").value;
  const title = $("#titleInput").value.trim();
  const subject = $("#subjectInput").value.trim();
  const dueDate = $("#dueInput").value;
  const priority = $("#priorityInput").value;
  const status = $("#statusInput").value;
  const notes = $("#notesInput").value.trim();

  if (!title || !subject || !dueDate) {
    toast("Please fill in the title, subject, and due date.");
    return;
  }

  const fields = {
    title,
    subject,
    due_date: dueDate,
    priority,
    completed: status === "Completed",
    notes
  };

  const { data, error } = id
    ? await supabaseClient
        .from("assignments")
        .update(fields)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single()
    : await supabaseClient
        .from("assignments")
        .insert({ ...fields, user_id: user.id })
        .select()
        .single();

  if (error) {
    toast("Could not save assignment: " + error.message);
    return;
  }

  const savedTask = fromDatabase(data);

  if (id) {
    assignments = assignments.map(task =>
      task.id === id ? savedTask : task
    );
    logActivity(`Updated ${title}`, "updated");
  } else {
    assignments.push(savedTask);
    logActivity(`Added ${title}`, "added");
  }

  closeDialog();
  renderAll();
  toast(id ? "Assignment updated." : "Assignment added.");
});

$("#closeDialog").addEventListener("click", closeDialog);
$("#cancelDialog").addEventListener("click", closeDialog);
$("#assignmentDialog").addEventListener("click", event => { if (event.target === $("#assignmentDialog")) closeDialog(); });
["topAdd","quickAdd","assignAdd","calendarAdd","emptyAdd"].forEach(id => $(`#${id}`)?.addEventListener("click", () => openDialog()));
$$("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
$$(".nav-item[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));
$("#searchInput").addEventListener("input", renderAssignments);
$("#statusFilter").addEventListener("change", renderAssignments);
$("#subjectFilter").addEventListener("change", renderAssignments);

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const task = findTask(button.dataset.id);
  if (!task) return;

  if (button.dataset.action === "edit") {
    openDialog(task);
    return;
  }

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData.user) {
    toast("Please log in before changing assignments.");
    return;
  }

  const userId = authData.user.id;

  if (button.dataset.action === "complete") {
    const { data, error } = await supabaseClient
      .from("assignments")
      .update({ completed: true })
      .eq("id", task.id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      toast("Could not complete assignment: " + error.message);
      return;
    }

    const updatedTask = fromDatabase(data);
    assignments = assignments.map(item =>
      item.id === task.id ? updatedTask : item
    );

    logActivity(`Completed ${task.title}`, "completed");
    renderAll();
    toast("Great work — assignment completed!");
    return;
  }

  if (button.dataset.action === "delete") {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      return;
    }

    const { data, error } = await supabaseClient
      .from("assignments")
      .delete()
      .eq("id", task.id)
      .eq("user_id", userId)
      .select("id");

    if (error) {
      toast("Could not delete assignment: " + error.message);
      return;
    }

    if (!data || data.length === 0) {
      toast("Assignment was not deleted. Please refresh and try again.");
      return;
    }

    assignments = assignments.filter(item => item.id !== task.id);
    logActivity(`Deleted ${task.title}`, "warning");
    renderAll();
    toast("Assignment deleted.");
  }
});

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("studyflow.theme", document.body.classList.contains("dark") ? "dark" : "light");
}
$("#themeToggle").addEventListener("click", toggleTheme);
$("#headerTheme").addEventListener("click", toggleTheme);
if (localStorage.getItem("studyflow.theme") === "dark") document.body.classList.add("dark");
$("#todayLabel").textContent = new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
$("#year").textContent = new Date().getFullYear();

// A clean first-run experience: the dashboard starts empty, ready for your real assignments.
renderAll();

/* StudyFlow email authentication */

const authForm = document.getElementById("auth-form");
const signupButton = document.getElementById("signup-button");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const authMessage = document.getElementById("auth-message");
const authUser = document.getElementById("auth-user");

function showAuthMessage(message) {
  if (authMessage) authMessage.textContent = message;
}

function updateAuthUI(user) {
  const authSection = document.getElementById("auth-section");
  const dashboard = document.getElementById("dashboard-content");

  if (authSection) {
    authSection.hidden = false;
  }

  if (dashboard) {
    dashboard.hidden = !user;
  }

  if (authForm) {
    authForm.hidden = Boolean(user);
  }

  if (loginButton) {
    loginButton.hidden = Boolean(user);
  }

  if (signupButton) {
    signupButton.hidden = Boolean(user);
  }

  if (logoutButton) {
    logoutButton.hidden = !user;
  }

  if (authUser) {
    authUser.textContent = user
      ? "Signed in as " + user.email
      : "You are not signed in.";
  }
}
// Log in existing users
authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  showAuthMessage("Signing in...");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showAuthMessage(error.message);
    return;
  }

  updateAuthUI(data.user);
  showAuthMessage("Login successful!");
});

// Create new accounts
signupButton?.addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  if (!email || password.length < 6) {
    showAuthMessage("Enter your email and a password of at least 6 characters.");
    return;
  }

  showAuthMessage("Creating your account...");

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  if (error) {
    showAuthMessage(error.message);
    return;
  }

  if (data.session) {
    updateAuthUI(data.user);
    showAuthMessage("Account created successfully!");
  } else {
    showAuthMessage(
      "Account created. Check your email to confirm your address, then log in."
    );
  }
});


 // Log out
const dashboardLogoutButton =
  document.getElementById("dashboard-logout");

async function handleLogout() {
  if (logoutButton) logoutButton.disabled = true;
  if (dashboardLogoutButton) {
    dashboardLogoutButton.disabled = true;
  }

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showAuthMessage(error.message);
      return;
    }

    updateAuthUI(null);
    showAuthMessage("You have logged out.");
  } catch (error) {
    showAuthMessage(
      error.message || "Unable to log out. Please try again."
    );
  } finally {
    if (logoutButton) logoutButton.disabled = false;
    if (dashboardLogoutButton) {
      dashboardLogoutButton.disabled = false;
    }
  }
}

logoutButton?.addEventListener("click", handleLogout);
dashboardLogoutButton?.addEventListener("click", handleLogout);


 // Restore the existing login session on page load
(async () => {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAuthMessage(error.message);
    return;
  }

  updateAuthUI(data.session?.user ?? null);

  if (data.session?.user) {
    await loadAssignmentsFromSupabase();
  } else {
    assignments = [];
    renderAll();
  }
})();


// Update the interface when authentication changes
supabaseClient.auth.onAuthStateChange((_event, session) => {
  updateAuthUI(session?.user ?? null);

  if (session?.user) {
    setTimeout(() => {
      loadAssignmentsFromSupabase();
    }, 0);
  } else {
    assignments = [];
    renderAll();
  }
});
 
