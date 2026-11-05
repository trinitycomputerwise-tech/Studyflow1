
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



function checkAssignmentNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const today = todayISO();
  const todayDate = new Date(today + "T00:00:00");

  assignments.forEach(task => {
    if (task.status === "Completed" || !task.dueDate) return;

    const dueDate = new Date(task.dueDate + "T00:00:00");
    const daysUntilDue = Math.round(
      (dueDate - todayDate) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0 || daysUntilDue > 1) return;

    const reminderKey =
      `studyflow-reminder-${task.id}-${today}-${daysUntilDue}`;

    if (localStorage.getItem(reminderKey)) return;

    const message = daysUntilDue < 0
      ? "This assignment is overdue."
      : daysUntilDue === 0
        ? "This assignment is due today."
        : "This assignment is due tomorrow.";

    try {
      new Notification(task.title, {
        body: `${task.subject}: ${message}`
      });

      localStorage.setItem(reminderKey, "sent");
    } catch (error) {
      console.error("StudyFlow reminder error:", error);
    }
  });
}

setInterval(() => {
  checkAssignmentNotifications();
}, 5 * 60 * 1000);



function getDeadlineReminder(task) {
  if (task.status === "Completed") {
    return '<span class="reminder-completed">Completed</span>';
  }

  const today = new Date(todayISO() + "T00:00:00");
  const dueDate = new Date(task.dueDate + "T00:00:00");
  const daysUntilDue = Math.round(
    (dueDate - today) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilDue < 0) {
    return '<span class="reminder-overdue">Overdue</span>';
  }

  if (daysUntilDue === 0) {
    return '<span class="reminder-today">Due today</span>';
  }

  if (daysUntilDue === 1) {
    return '<span class="reminder-tomorrow">Due tomorrow</span>';
  }

  return `<span class="reminder-upcoming">Due in ${daysUntilDue} days</span>`;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Your browser does not support notifications.");
    return;
  }

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "granted") {
    const notification = new Notification(
      "StudyFlow notifications enabled",
      {
        body: "You'll be able to receive assignment deadline reminders."
      }
    );

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } else {
    alert("Notifications are blocked. Please check your browser settings.");
  }
}

const enableButton = document.querySelector("#enableNotifications");

if (enableButton) {
  enableButton.addEventListener("click", async () => {
    try {
      await requestNotificationPermission();
    } catch (error) {
      console.error("StudyFlow notification error:", error);
      alert("Could not enable notifications. Please check your browser settings.");
    }
  });
}

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
checkAssignmentNotifications();
}

async function loadTutoringData() {
  const message = document.getElementById("tutorProfileMessage");
  const directory = document.getElementById("tutorDirectory");
  const requests = document.getElementById("tutoringRequests");

  if (!directory || !requests) return;

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData.user) {
    directory.textContent = "Please sign in to view tutors.";
    requests.textContent = "Please sign in to view tutoring requests.";
    return;
  }

  const { data: tutors, error: tutorError } = await supabaseClient
    .from("tutor_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (tutorError) {
    directory.textContent = "Could not load tutors: " + tutorError.message;
  } else if (!tutors || tutors.length === 0) {
    directory.textContent = "No tutor profiles yet. Be the first to register!";
  } else {
    directory.replaceChildren();

    tutors.forEach(tutor => {
      const card = document.createElement("article");
      card.className = "panel";

      const heading = document.createElement("h3");
      heading.textContent = tutor.display_name;

      const subjects = document.createElement("p");
      subjects.textContent = "Subjects: " + (tutor.subjects || []).join(", ");

      const bio = document.createElement("p");
      bio.textContent = tutor.bio || "No biography provided.";

      const experience = document.createElement("p");
      experience.textContent = "Experience: " + (tutor.experience || "Not specified");

      const availability = document.createElement("p");
      availability.textContent = "Availability: " + (tutor.availability || "Not specified");

      const price = document.createElement("p");
price.textContent = tutor.session_price_ngn
  ? "Price per session: " + new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(tutor.session_price_ngn)
  : "Price per session: Not set";

card.append(heading, subjects, bio, experience, availability, price);

      if (tutor.id !== authData.user.id) {
        const form = document.createElement("form");

        const subjectLabel = document.createElement("label");
        subjectLabel.textContent = "Subject ";
        const subjectInput = document.createElement("input");
        subjectInput.required = true;
        subjectInput.maxLength = 100;
        subjectInput.placeholder = "Subject you need help with";
        subjectLabel.append(subjectInput);

        const dateLabel = document.createElement("label");
        dateLabel.textContent = "Preferred date ";
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.min = new Date().toISOString().slice(0, 10);
        dateLabel.append(dateInput);

        const timeLabel = document.createElement("label");
        timeLabel.textContent = "Preferred time ";
        const timeInput = document.createElement("input");
        timeInput.placeholder = "e.g. 4 PM";
        timeInput.maxLength = 80;
        timeLabel.append(timeInput);

        const messageLabel = document.createElement("label");
        messageLabel.textContent = "Message ";
        const messageInput = document.createElement("textarea");
        messageInput.maxLength = 1000;
        messageInput.placeholder = "What would you like help with?";
        messageLabel.append(messageInput);

        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "primary-button";
        submit.textContent = "Request tutoring";

        form.append(subjectLabel, dateLabel, timeLabel, messageLabel, submit);

        form.addEventListener("submit", async event => {
          event.preventDefault();
          submit.disabled = true;

          const { error } = await supabaseClient
            .from("tutoring_requests")
            .insert({
              student_id: authData.user.id,
              tutor_id: tutor.id,
              subject: subjectInput.value.trim(),
              requested_date: dateInput.value || null,
              requested_time: timeInput.value.trim(),
              message: messageInput.value.trim(),
              status: "Pending"
            });

          submit.disabled = false;

          if (error) {
            alert("Could not send request: " + error.message);
            return;
          }

          alert("Tutoring request sent!");
          await loadTutoringData();
        });

        card.append(form);
      }

      directory.append(card);
    });
  }

  const { data: ownProfile, error: ownProfileError } = await supabaseClient
    .from("tutor_profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (ownProfileError) {
    if (message) message.textContent = "Could not load your profile: " + ownProfileError.message;
  } else if (ownProfile) {
    document.getElementById("tutorDisplayName").value = ownProfile.display_name || "";
    document.getElementById("tutorSubjects").value = (ownProfile.subjects || []).join(", ");
    document.getElementById("tutorBio").value = ownProfile.bio || "";
    document.getElementById("tutorAvailability").value = ownProfile.availability || "";
    const priceInput = document.getElementById("tutorSessionPrice");
    if (priceInput) priceInput.value = ownProfile.session_price_ngn ?? "";
  }

    const { data: ownRequests, error: requestError } = await supabaseClient
    .from("tutoring_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (requestError) {
    requests.textContent = "Could not load requests: " + requestError.message;
    return;
  }

  requests.replaceChildren();

  if (!ownRequests || ownRequests.length === 0) {
    requests.textContent = "No tutoring requests yet.";
    return;
  }

  const requestIds = ownRequests.map(request => request.id);

 const { data: paymentRecords, error: paymentError } =
  await supabaseClient
    .from("tutoring_payments")
    .select("request_id, status, amount_ngn, created_at")
    .in("request_id", requestIds)
    .order("created_at", { ascending: false });

if (paymentError) {
  console.error("Could not load payment records:", paymentError);
}

const paymentsByRequest = {};

(paymentRecords || []).forEach(payment => {
  if (!paymentsByRequest[payment.request_id]) {
    paymentsByRequest[payment.request_id] = payment;
  }
});

  ownRequests.forEach(request => {
    const item = document.createElement("article");
    item.className = "panel";

    const title = document.createElement("h3");
    title.textContent = request.subject;

    const details = document.createElement("p");
    details.textContent =
      "Status: " + request.status +
      " · Preferred date: " + (request.requested_date || "Not specified") +
      " · Preferred time: " + (request.requested_time || "Not specified");

    const note = document.createElement("p");
    note.textContent = request.message || "No message provided.";

    item.append(title, details, note);

    if (request.tutor_id === authData.user.id && request.status === "Pending") {
      ["Approved", "Rejected"].forEach(status => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = status;

        button.addEventListener("click", async () => {
          const { error } = await supabaseClient
            .from("tutoring_requests")
            .update({ status })
            .eq("id", request.id)
            .eq("status", "Pending");

          if (error) {
            alert("Could not update request: " + error.message);
            return;
          }

          await loadTutoringData();
        });

        item.append(button);
      });
    }

   if (request.status === "Approved") {
  const payment = paymentsByRequest[request.id];

  if (payment?.status === "Paid") {
    const paidMessage = document.createElement("p");
    paidMessage.textContent =
      "Payment completed — ₦" +
      Number(payment.amount_ngn).toLocaleString("en-NG") +
      " Paid";
    paidMessage.style.color = "green";
    paidMessage.style.fontWeight = "bold";
    item.append(paidMessage);

  } else if (request.student_id === authData.user.id) {
    const payButton = document.createElement("button");
    payButton.type = "button";
    payButton.className = "primary-button";

    if (payment?.status === "Pending") {
      payButton.textContent = "Check payment / Retry";
    } else if (payment?.status === "Failed") {
      payButton.textContent = "Retry payment";
    } else {
      payButton.textContent = "Pay for session";
    }

    const originalButtonText = payButton.textContent;

    payButton.addEventListener("click", async () => {
      payButton.disabled = true;
      payButton.textContent = "Checking payment...";

      try {
        const { data: sessionData, error: sessionError } =
          await supabaseClient.auth.getSession();

        if (sessionError || !sessionData.session?.access_token) {
          throw new Error("Please sign in again before making payment.");
        }

        const checkoutResponse = await fetch(
          "/.netlify/functions/create-paystack-checkout",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session.access_token}`
            },
            body: JSON.stringify({ requestId: request.id })
          }
        );

        const checkout = await checkoutResponse.json();

        if (!checkoutResponse.ok || !checkout.authorization_url) {
          throw new Error(
            checkout.error || "Could not start payment. Please try again."
          );
        }

        window.location.assign(checkout.authorization_url);
      } catch (error) {
        alert(error.message || "Could not start payment.");
        payButton.disabled = false;
        payButton.textContent = originalButtonText;
      }
    });

    item.append(payButton);
  }
}

requests.append(item);
  });
}

const tutorProfileForm = document.getElementById("tutorProfileForm");

if (tutorProfileForm) {
  tutorProfileForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.getElementById("tutorProfileMessage");
    const submitButton = tutorProfileForm.querySelector('button[type="submit"]');

    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) {
      message.textContent = "Please sign in before saving a tutor profile.";
      return;
    }

    const displayName = document.getElementById("tutorDisplayName").value.trim();
    const subjects = document.getElementById("tutorSubjects").value
      .split(",")
      .map(subject => subject.trim())
      .filter(Boolean);
    const bio = document.getElementById("tutorBio").value.trim();
    const availability = document.getElementById("tutorAvailability").value.trim();
    const sessionPrice = Number(document.getElementById("tutorSessionPrice").value);

    if (!displayName || subjects.length === 0 || !bio || !availability ||
    !Number.isInteger(sessionPrice) || sessionPrice <= 0) {
      message.textContent = "Please complete all tutor profile fields.";
      return;
    }

    submitButton.disabled = true;
    message.textContent = "Saving your profile...";

    try {
      const { error } = await supabaseClient
        .from("tutor_profiles")
        .upsert({
          id: authData.user.id,
          display_name: displayName,
          subjects,
          bio,
          experience: bio,
          availability,
          session_price_ngn: sessionPrice,
        });

      if (error) {
        message.textContent = "Could not save profile: " + error.message;
        return;
      }

      message.textContent = "Tutor profile saved successfully!";
      await loadTutoringData();
    } catch (error) {
      message.textContent = "Could not save profile. Please try again.";
      console.error("StudyFlow tutor profile error:", error);
    } finally {
      submitButton.disabled = false;
    }
  });
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

async function setView(view) {
  const known = ["dashboard","assignments","subjects","calendar","tutoring","materials","payouts","quizzes"];

  if (!known.includes(view)) view = "dashboard";

  if (view === "payouts") {
    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;

    if (!user) {
      alert("Please sign in first.");
      return;
    }

    const { data: roles, error } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = !error && roles?.some(item => item.role === "admin");

    if (!isAdmin) {
      alert("Access denied. Administrator access is required.");
      return;
    }
  }

  $$(".view").forEach(node =>
    node.classList.toggle("active-view", node.id === `${view}View`)
  );

  $$(".nav-item[data-view]").forEach(node =>
    node.classList.toggle("active", node.dataset.view === view)
  );

  $("#pageLabel").textContent = view[0].toUpperCase() + view.slice(1);
  $("#sidebar").classList.remove("mobile-open");

  if (view === "assignments") renderAssignments();
  if (view === "subjects") renderSubjectsPage();
  if (view === "calendar") renderCalendar();
  if (view === "tutoring") loadTutoringData();
  if (view === "materials") loadStudyMaterials();
  if (view === "payouts") loadTutorPayouts();

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
  renderStats();
  renderUpcoming();
  renderSubjectOverview();
  renderActivity();
  updateSubjectFilter();
  loadAdminFinancialOverview();
}

async function loadAdminFinancialOverview() {
  const panel = document.getElementById("adminFinancialOverview");
  if (!panel) return;

  panel.hidden = true;

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) return;

  const { data: roles, error: roleError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = !roleError && roles?.some(item => item.role === "admin");

  if (!isAdmin) return;

  panel.hidden = false;

  const message = document.getElementById("adminFinancialMessage");
  message.textContent = "Loading financial figures...";

  const { data: payments, error: paymentError } = await supabaseClient
    .from("tutoring_payments")
    .select("amount_ngn")
    .eq("status", "Paid")
    .eq("payment_mode", "live");

  if (paymentError) {
    message.textContent = "Unable to load financial figures.";
    console.error(paymentError);
    return;
  }

  const { data: payouts, error: payoutError } = await supabaseClient
    .from("tutor_payouts")
    .select("platform_commission_ngn, tutor_earning_ngn, payout_status");

  if (payoutError) {
    message.textContent = "Unable to load payout figures.";
    console.error(payoutError);
    return;
  }

  const totalRevenue = (payments || []).reduce(
    (sum, payment) => sum + Number(payment.amount_ngn || 0), 0
  );

  const commission = Math.round(totalRevenue * 0.15);
  const tutorEarnings = totalRevenue - commission;

  const outstanding = (payouts || [])
    .filter(payout => payout.payout_status === "Ready for payout")
    .reduce((sum, payout) => sum + Number(payout.tutor_earning_ngn || 0), 0);

  const formatNaira = amount =>
    "₦" + amount.toLocaleString("en-NG");

  document.getElementById("adminTotalRevenue").textContent =
    formatNaira(totalRevenue);

  document.getElementById("adminCommission").textContent =
    formatNaira(commission);

  document.getElementById("adminTutorEarnings").textContent =
    formatNaira(tutorEarnings);

  document.getElementById("adminOutstandingPayouts").textContent =
    formatNaira(outstanding);

  message.textContent =
    "Estimates based on successful Live Mode payments: 15% StudyFlow commission and 85% tutor share. Processing fees are not deducted. Final payouts are prepared only after session confirmation.";
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
      <td>${escapeHTML(a.subject)}</td>
      <td>
         ${escapeHTML(formatDate(a.dueDate))}
         <div class="table-sub">${getDeadlineReminder(a)}</div>
      </td>
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
function findTask(id) {
  return assignments.find(task => String(task.id) === String(id));
}


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
  console.log("Original handler detected:", button.dataset.action, button.dataset.id);

  const task = findTask(button.dataset.id);

console.log("Task lookup result:", task);

if (!task) {
  console.log("STOPPED: No matching assignment found.");
  return;
}

  if (button.dataset.action === "edit") {
    console.log("EDIT action reached");
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
    console.log("DELETE action reached");
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
const forgotPasswordButton = document.getElementById("forgot-password-button");
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
  authSection.hidden =
    Boolean(user) || !document.getElementById("reset-password-section")?.hidden;
}

 if (dashboard) {
  const resetSection = document.getElementById("reset-password-section");
  const isResettingPassword = resetSection && !resetSection.hidden;
  dashboard.hidden = !user || isResettingPassword;
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

const dashboardLogoutButton =
  document.getElementById("dashboard-logout");

if (dashboardLogoutButton) {
  dashboardLogoutButton.hidden = !user;
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


 // Send password reset email
forgotPasswordButton?.addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();

  if (!email) {
    showAuthMessage("Enter your email address first, then click Forgot password?");
    document.getElementById("auth-email").focus();
    return;
  }

  showAuthMessage("Sending password reset email...");

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (error) {
    showAuthMessage(error.message);
    return;
  }

  showAuthMessage("If an account exists for this email, a password reset link will be sent. Please check your inbox.");
});

const resetPasswordSection = document.getElementById("reset-password-section");
const resetPasswordForm = document.getElementById("reset-password-form");
const resetPasswordMessage = document.getElementById("reset-password-message");

// Show the password form when Supabase returns the user from a reset link
async function checkPasswordResetLink() {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const isRecovery = params.get("type") === "recovery";

  if (!isRecovery) return;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    resetPasswordMessage.textContent =
      "This reset link is invalid or has expired. Please request a new one.";
    resetPasswordSection.hidden = false;
    return;
  }

  resetPasswordSection.hidden = false;
  document.getElementById("auth-section").hidden = true;
}
resetPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-new-password").value;

  if (password.length < 6) {
    resetPasswordMessage.textContent =
      "Your password must be at least 6 characters long.";
    return;
  }

  if (password !== confirmPassword) {
    resetPasswordMessage.textContent = "The passwords do not match.";
    return;
  }

  resetPasswordMessage.textContent = "Updating your password...";

  const { error } = await supabaseClient.auth.updateUser({ password });

  if (error) {
    resetPasswordMessage.textContent = error.message;
    return;
  }

  resetPasswordMessage.textContent =
    "Password updated successfully! You can now log in with your new password.";

  resetPasswordForm.reset();
});

checkPasswordResetLink();



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
  await loadTutoringData();
  } else {
    assignments = [];
    renderAll();
  }
})();


// Update the interface when authentication changes

supabaseClient.auth.onAuthStateChange((event, session) => {
  updateAuthUI(session?.user ?? null);

setTimeout(async () => {
  const payoutsButton = document.getElementById("payoutsNavButton");

  if (!session?.user) {
    if (payoutsButton) payoutsButton.hidden = true;
    return;
  }

  const { data: roles, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id);

  const isAdmin = !error && roles?.some(item => item.role === "admin");

  if (payoutsButton) {
    payoutsButton.hidden = !isAdmin;
  }
}, 0);
  
  if (event === "PASSWORD_RECOVERY") {
    document.getElementById("auth-section").hidden = true;
    document.getElementById("reset-password-section").hidden = false;
    document.getElementById("dashboardView").classList.remove("active-view");
  }

  
if (session?.user) {
  setTimeout(async () => {
    await loadAssignmentsFromSupabase();
    await loadTutoringData();
  }, 0);
} else {
  assignments = [];
  renderAll();

  const directory = document.getElementById("tutorDirectory");
  const requests = document.getElementById("tutoringRequests");

  if (directory) directory.textContent = "Please sign in to view tutors.";
  if (requests) requests.textContent = "Please sign in to view tutoring requests.";
}

});

// ===============================
// STUDY MATERIALS
// ===============================
let currentMaterialsPage = 1;
const materialsPerPage = 10;
async function loadStudyMaterials() {
  const list = document.getElementById("materialsList");
  const uploadPanel = document.getElementById("materialUploadPanel");

  if (!list) return;

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    list.innerHTML = "<p>Please log in to view study materials.</p>";
    return;
  }

  const { data: roles } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const canUpload = roles?.some(item =>
    ["admin", "tutor"].includes(item.role)
  );

  if (uploadPanel) {
    uploadPanel.style.display = canUpload ? "block" : "none";
  }

  const { data: materials, error } = await supabaseClient
    .from("study_materials")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "<p>Unable to load study materials. Please try again.</p>";
    console.error(error);
    return;
  }

  renderStudyMaterials(materials || []);
}


async function loadTutorPayouts() {
  const list = document.getElementById("payoutsList");
  if (!list) return;

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    list.textContent = "Please sign in first.";
    return;
  }

  const { data: roles, error: roleError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = !roleError && roles?.some(item => item.role === "admin");

  if (!isAdmin) {
    list.textContent = "Administrator access required.";
    return;
  }

  list.textContent = "Loading tutor payouts...";

  const { data: payouts, error } = await supabaseClient
    .from("tutor_payouts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Unable to load tutor payouts.";
    console.error(error);
    return;
  }

  const { data: requests, error: requestError } = await supabaseClient
    .from("tutoring_requests")
    .select("id, subject, tutor_id, student_id, status, session_completed_at")
    .eq("status", "Approved")
    .is("session_completed_at", null);

  if (requestError) {
    list.textContent = "Unable to load tutoring requests.";
    console.error(requestError);
    return;
  }

  const existingRequestIds = new Set(
    (payouts || []).map(p => p.request_id)
  );

  const unpaidCheckRequests = (requests || []).filter(
    r => !existingRequestIds.has(r.id)
  );

  let paidRequests = [];

  if (unpaidCheckRequests.length > 0) {
    const { data: payments, error: paymentError } = await supabaseClient
      .from("tutoring_payments")
      .select("request_id")
     .in("request_id", unpaidCheckRequests.map(r => r.id))
     .eq("status", "Paid")
     .eq("payment_mode", "live");

    if (paymentError) {
      list.textContent = "Unable to check successful student payments.";
      console.error(paymentError);
      return;
    }

    const paidIds = new Set((payments || []).map(p => p.request_id));

    paidRequests = unpaidCheckRequests.filter(r => paidIds.has(r.id));
  }

  let html = "<h2>Sessions awaiting confirmation</h2>";

  if (paidRequests.length === 0) {
    html += "<p>No paid sessions are awaiting confirmation.</p>";
  } else {
    html += paidRequests.map(request => `
      <div class="panel" style="margin-top:12px;">
        <p><strong>Subject:</strong> ${escapeHtml(request.subject || "Tutoring session")}</p>
        <p><strong>Tutor ID:</strong> ${escapeHtml(request.tutor_id)}</p>
        <p><strong>Student ID:</strong> ${escapeHtml(request.student_id)}</p>
        <p><strong>Status:</strong> Awaiting session confirmation</p>
        <button
          class="primary-btn"
          type="button"
          data-confirm-request="${escapeHtml(request.id)}"
        >
          Confirm completed session
        </button>
      </div>
    `).join("");
  }

  html += "<h2 style='margin-top:25px;'>Prepared tutor payouts</h2>";

  if (!payouts || payouts.length === 0) {
    html += "<p>No tutor payouts available yet.</p>";
  } else {
    html += payouts.map(payout => `
      <div class="panel" style="margin-top:12px;">
        <p><strong>Tutor ID:</strong> ${escapeHtml(payout.tutor_id)}</p>
        <p><strong>Student payment:</strong> ₦${Number(payout.student_payment_ngn).toLocaleString("en-NG")}</p>
        <p><strong>StudyFlow commission:</strong> ₦${Number(payout.platform_commission_ngn).toLocaleString("en-NG")}</p>
        <p><strong>Tutor earnings:</strong> ₦${Number(payout.tutor_earning_ngn).toLocaleString("en-NG")}</p>
        <p><strong>Status:</strong> ${escapeHtml(payout.payout_status)}</p>
        ${payout.payout_status === "Ready for payout" ? `
          <button class="primary-btn" type="button" data-mark-paid="${escapeHtml(payout.id)}">
            Mark as Paid
          </button>
`         : ""}
      </div>
    `).join("");
  }

  list.innerHTML = html;
  list.querySelectorAll("[data-mark-paid]").forEach(button => {
  button.addEventListener("click", async () => {
    const payoutId = button.dataset.markPaid;

    const payoutReference = prompt(
      "Enter the bank transfer reference from your bank receipt:"
    );

    if (payoutReference === null) return;

    const cleanReference = payoutReference.trim();

    if (!cleanReference || cleanReference.length > 200) {
      alert("Enter a valid transfer reference (1–200 characters).");
      return;
    }

    if (!confirm("Have you already completed the bank transfer to the tutor?")) {
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    const { error: payoutError } = await supabaseClient.rpc(
      "mark_tutor_payout_paid",
      {
        p_payout_id: payoutId,
        p_payout_reference: cleanReference
      }
    );

    if (payoutError) {
      alert("Could not record tutor payment: " + payoutError.message);
      button.disabled = false;
      button.textContent = "Mark as Paid";
      return;
    }

    alert("Tutor payment recorded successfully.");
    await loadTutorPayouts();
  });
});

  list.querySelectorAll("[data-confirm-request]").forEach(button => {
    button.addEventListener("click", async () => {
      const requestId = button.dataset.confirmRequest;

      if (!confirm("Have you verified that this tutoring session was completed?")) {
        return;
      }

      button.disabled = true;
      button.textContent = "Confirming...";

      const { error: confirmError } = await supabaseClient.rpc(
        "confirm_tutoring_session",
        { p_request_id: requestId }
      );

      if (confirmError) {
        alert("Confirmation failed: " + confirmError.message);
        button.disabled = false;
        button.textContent = "Confirm completed session";
        return;
      }

      alert("Session confirmed and tutor payout prepared.");
      await loadTutorPayouts();
    });
  });
}

function renderStudyMaterials(materials) {
  const list = document.getElementById("materialsList");
  if (!list) return;

  const search = document.getElementById("materialSearch");
const subjectFilter = document.getElementById("materialSubjectFilter");
const term = search?.value?.toLowerCase() || "";
const selectedSubject = subjectFilter?.value || "";

// Build the subject list automatically
if (subjectFilter) {
  const currentSubject = subjectFilter.value;
  const subjects = [...new Set(
    materials.map(item => item.subject).filter(Boolean)
  )].sort();

  subjectFilter.innerHTML =
    '<option value="">All Subjects</option>' +
    subjects.map(subject =>
      `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`
    ).join("");

  subjectFilter.value = currentSubject;
}
const sortOrder = document.getElementById("materialSort")?.value || "newest";
const filtered = materials.filter(item => {
  const matchesSearch =
    (item.title || "").toLowerCase().includes(term) ||
    (item.subject || "").toLowerCase().includes(term);

  const matchesSubject =
    !selectedSubject || item.subject === selectedSubject;

  return matchesSearch && matchesSubject;
});
  filtered.sort((a, b) => {
  if (sortOrder === "oldest") {
    return new Date(a.created_at) - new Date(b.created_at);
  }

  if (sortOrder === "alphabetical") {
    return a.title.localeCompare(b.title);
  }

  return new Date(b.created_at) - new Date(a.created_at);
});

  if (!filtered.length) {
    list.innerHTML = "<p class='muted'>No study materials found.</p>";
    return;
  }
  
  const totalPages = Math.max(1, Math.ceil(filtered.length / materialsPerPage));

  if (currentMaterialsPage > totalPages) {
    currentMaterialsPage = totalPages;
  }

const startIndex = (currentMaterialsPage - 1) * materialsPerPage;
const paginatedMaterials = filtered.slice(
  startIndex,
  startIndex + materialsPerPage
);

document.getElementById("materialsPageInfo").textContent =
  `Page ${currentMaterialsPage} of ${totalPages}`;

document.getElementById("materialsPrevious").disabled =
  currentMaterialsPage === 1;

document.getElementById("materialsNext").disabled =
  currentMaterialsPage === totalPages;

list.innerHTML = paginatedMaterials.map(item => {
  const fileName = item.file_name || "";
  const extension = fileName.split(".").pop().toLowerCase();

  let fileIcon = "📄";

  if (extension === "pdf") fileIcon = "📕";
  else if (["doc", "docx"].includes(extension)) fileIcon = "📝";
  else if (["ppt", "pptx"].includes(extension)) fileIcon = "📊";
  else if (["xls", "xlsx"].includes(extension)) fileIcon = "📈";
  else if (item.video_url) fileIcon = "🎥";

  const uploadDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString()
    : "Date unavailable";

  return `
    <div class="panel" style="margin-top:15px;">
      <h3>${fileIcon} ${escapeHtml(item.title)}</h3>
      <p><strong>Subject:</strong> ${escapeHtml(item.subject)}</p>
      <p><strong>Category:</strong> ${escapeHtml(item.category || "Notes")}</p>
      <p><strong>Uploaded:</strong> ${uploadDate}</p>
      <p>${escapeHtml(item.description || "")}</p>
      ${item.file_path ? `<button class="secondary-btn" onclick="downloadStudyMaterial('${item.id}')">Download Material</button>` : ""}
      ${item.video_url ? `<p><a href="${escapeHtml(item.video_url)}" target="_blank" rel="noopener noreferrer">🎥 Watch Video</a></p>` : ""}
      <div id="materialActions-${item.id}"></div>
    </div>
  `;
}).join("");

  addStudyMaterialActions(filtered);
}

async function addStudyMaterialActions(materials) {
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  const { data: roles } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = roles?.some(item => item.role === "admin");
  const isTutor = roles?.some(item => item.role === "tutor");

  materials.forEach(item => {
   if (isAdmin || (isTutor && item.uploader_id === user.id)) {
      const actions = document.getElementById(`materialActions-${item.id}`);
      if (actions) {
        actions.innerHTML = `
  <button class="secondary-btn" onclick="editStudyMaterial('${item.id}')">Edit</button>
  <button class="secondary-btn" onclick="deleteStudyMaterial('${item.id}', '${escapeHtml(item.file_path || "")}')">Delete</button>
`;
      }
    }
  });
}

async function uploadStudyMaterial(event) {
  event.preventDefault();

  const message = document.getElementById("materialUploadMessage");
  const title = document.getElementById("materialTitle").value.trim();
  const subject = document.getElementById("materialSubject").value.trim();
  const category = document.getElementById("materialCategory").value;
  const description = document.getElementById("materialDescription").value.trim();
  const file = document.getElementById("materialFile").files[0];
  const videoUrl = document.getElementById("materialVideoUrl").value.trim();

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    message.textContent = "Please log in first.";
    return;
  }

  if (!file && !videoUrl) {
    message.textContent = "Please select a file or enter a video link.";
    return;
  }

  message.textContent = "Uploading...";

  let filePath = null;

  if (file) {
    filePath = `${user.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("study-materials")
      .upload(filePath, file);

    if (uploadError) {
      message.textContent = "File upload failed: " + uploadError.message;
      return;
    }
  }

  const { error } = await supabaseClient
    .from("study_materials")
    .insert({
      title,
      subject,
      category,
      description,
      file_path: filePath,
      file_name: file?.name || null,
      video_url: videoUrl || null,
      uploader_id: user.id
    });

  if (error) {
    if (filePath) {
      await supabaseClient.storage.from("study-materials").remove([filePath]);
    }
    message.textContent = "Could not save material: " + error.message;
    return;
  }

  document.getElementById("materialUploadForm").reset();
  message.textContent = "Study material uploaded successfully!";
  loadStudyMaterials();
}

async function downloadStudyMaterial(id) {
  const { data: material, error } = await supabaseClient
    .from("study_materials")
    .select("file_path, file_name")
    .eq("id", id)
    .single();

  if (error || !material?.file_path) {
    alert("Material file not found.");
    return;
  }

  const { data, error: downloadError } = await supabaseClient.storage
    .from("study-materials")
    .createSignedUrl(material.file_path, 60);

  if (downloadError) {
    alert("Download failed: " + downloadError.message);
    return;
  }

  window.open(data.signedUrl, "_blank");
}

async function deleteStudyMaterial(id, filePath) {
  if (!confirm("Are you sure you want to delete this material?")) return;

  const { error } = await supabaseClient
    .from("study_materials")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Could not delete material: " + error.message);
    return;
  }

  if (filePath) {
    const { error: storageError } = await supabaseClient.storage
      .from("study-materials")
      .remove([filePath]);

    if (storageError) console.error(storageError);
  }

  alert("Material deleted.");
  loadStudyMaterials();
}
async function editStudyMaterial(id) {
  const { data: material, error: fetchError } = await supabaseClient
    .from("study_materials")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !material) {
    alert("Could not load material details.");
    return;
  }

  const title = prompt("Edit material title:", material.title);
  if (title === null) return;

  const subject = prompt("Edit subject:", material.subject);
  if (subject === null) return;

  const category = prompt("Edit category:", material.category || "Notes");
  if (category === null) return;

  const description = prompt(
    "Edit description:",
    material.description || ""
  );
  if (description === null) return;

  if (!title.trim() || !subject.trim()) {
    alert("Title and subject are required.");
    return;
  }

  const { error } = await supabaseClient
    .from("study_materials")
    .update({
      title: title.trim(),
      subject: subject.trim(),
      category: category.trim(),
      description: description.trim()
    })
    .eq("id", id);

  if (error) {
    alert("Could not update material: " + error.message);
    return;
  }

  alert("Material updated successfully!");
  loadStudyMaterials();
}

// Connect form and search controls
document.getElementById("materialUploadForm")?.addEventListener(
  "submit",
  uploadStudyMaterial
);

document.getElementById("materialSearch")?.addEventListener(
  "input",
  () => {
    currentMaterialsPage = 1;
    loadStudyMaterials();
  }
);
document.getElementById("materialSubjectFilter")?.addEventListener(
  "change",
  () => {
    currentMaterialsPage = 1;
    loadStudyMaterials();
  }
);
document.getElementById("materialSort")?.addEventListener(
  "change",
  loadStudyMaterials
);

document.getElementById("materialsPrevious")?.addEventListener(
  "click",
  () => {
    if (currentMaterialsPage > 1) {
      currentMaterialsPage--;
      loadStudyMaterials();
    }
  }
);

document.getElementById("materialsNext")?.addEventListener(
  "click",
  () => {
    currentMaterialsPage++;
    loadStudyMaterials();
  }
);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
