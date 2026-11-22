
/* StudyFlow Supabase connection */
const SUPABASE_URL = "https://vpkqhxzzqdlqaqvioxbd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Gmho7VHOy9KRURyWFZRrLg_lyV238vM";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


/* StudyFlow AI chatbot connection */
async function askStudyFlowAI(messages) {
  const { data, error } = await supabaseClient.functions.invoke(
    "studyflow-ai",
    {
      body: { messages }
    }
  );

  if (error) {
    console.error("StudyFlow AI error:", error);
    throw new Error("Unable to connect to StudyFlow AI. Please try again.");
  }

  if (!data || !data.reply) {
    throw new Error(data?.error || "StudyFlow AI did not return an answer.");
  }

  return data.reply;
}

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
let currentTutorsPage = 1;
const tutorsPerPage = 10;
let currentTutoringRequestsPage = 1;
const tutoringRequestsPerPage = 10;
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
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (tutorError) {
    directory.textContent = "Could not load tutors: " + tutorError.message;
  } else if (!tutors || tutors.length === 0) {
    directory.textContent = "No tutor profiles yet. Be the first to register!";
  } else {
    const totalTutorPages = Math.max(
  1,
  Math.ceil(tutors.length / tutorsPerPage)
);

if (currentTutorsPage > totalTutorPages) {
  currentTutorsPage = totalTutorPages;
}

const startIndex = (currentTutorsPage - 1) * tutorsPerPage;

const paginatedTutors = tutors.slice(
  startIndex,
  startIndex + tutorsPerPage
);
    directory.replaceChildren();

    paginatedTutors.forEach(tutor => {
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

const shareSection = document.createElement("div");
shareSection.className = "social-share-section";

const shareHeading = document.createElement("p");
shareHeading.textContent = "Share this tutor's profile:";
shareSection.appendChild(shareHeading);

const shareUrl =
  window.location.origin +
  window.location.pathname +
  "#tutoringView";

const shareText =
  `Meet ${tutor.display_name} on StudyFlow! Subjects: ${(tutor.subjects || []).join(", ")}.`;

["whatsapp", "facebook", "x", "copy"].forEach(platform => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent =
    platform === "x" ? "X" :
    platform === "copy" ? "Copy Link" :
    platform.charAt(0).toUpperCase() + platform.slice(1);

  button.addEventListener("click", async () => {
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    if (platform === "whatsapp") {
      window.open(`https://wa.me/?text=${text}%20${url}`, "_blank");
    } else if (platform === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        "_blank"
      );
    } else if (platform === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
        "_blank"
      );
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        alert("Tutor profile sharing link copied!");
      } catch (error) {
        alert("Unable to copy. Please copy the website address manually.");
      }
    }
  });

  shareSection.appendChild(button);
});

card.append(
  heading,
  subjects,
  bio,
  experience,
  availability,
  price,
  shareSection
);

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
      } else {
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "secondary-button";
        editButton.textContent = "Edit Profile";

        editButton.addEventListener("click", () => {
          document.getElementById("tutorDisplayName").value =
            tutor.display_name || "";

          document.getElementById("tutorSubjects").value =
            (tutor.subjects || []).join(", ");

          document.getElementById("tutorBio").value =
            tutor.bio || "";

          document.getElementById("tutorAvailability").value =
            tutor.availability || "";

          const priceInput =
            document.getElementById("tutorSessionPrice");

          if (priceInput) {
            priceInput.value = tutor.session_price_ngn ?? "";
          }

          document.getElementById("tutorProfileForm")
            .scrollIntoView({ behavior: "smooth", block: "center" });
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "secondary-button";
        deleteButton.textContent = "Delete Profile";

        deleteButton.addEventListener("click", async () => {
          const confirmed = window.confirm(
            "Are you sure you want to hide your tutor profile? Your StudyFlow account and tutoring records will not be deleted."
          );

          if (!confirmed) return;

          deleteButton.disabled = true;
          deleteButton.textContent = "Deleting...";

          const { error } = await supabaseClient
            .from("tutor_profiles")
            .update({ is_active: false })
            .eq("id", authData.user.id);

          if (error) {
            alert("Could not hide your profile: " + error.message);
            deleteButton.disabled = false;
            deleteButton.textContent = "Delete Profile";
            return;
          }

          alert("Your tutor profile has been hidden successfully.");
          await loadTutoringData();
        });

        card.append(editButton, deleteButton);
      }

      directory.append(card);

    });
    const tutorPrevious = document.getElementById("tutorPrevious");
const tutorNext = document.getElementById("tutorNext");
const tutorPageInfo = document.getElementById("tutorPageInfo");

if (tutorPageInfo) {
  tutorPageInfo.textContent =
    `Page ${currentTutorsPage} of ${totalTutorPages}`;
}

if (tutorPrevious) {
  tutorPrevious.disabled = currentTutorsPage <= 1;
  tutorPrevious.onclick = async function () {
    if (currentTutorsPage > 1) {
      currentTutorsPage--;
      await loadTutoringData();
    }
  };
}

if (tutorNext) {
  tutorNext.disabled = currentTutorsPage >= totalTutorPages;
  tutorNext.onclick = async function () {
    if (currentTutorsPage < totalTutorPages) {
      currentTutorsPage++;
      await loadTutoringData();
    }
  };
}
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

    let statusElement = document.getElementById("tutorProfileStatus");

    if (!statusElement) {
      statusElement = document.createElement("p");
      statusElement.id = "tutorProfileStatus";
      statusElement.setAttribute("role", "status");

      const profileForm = document.getElementById("tutorProfileForm");
      if (profileForm) {
        profileForm.prepend(statusElement);
      }
    }

    if (statusElement) {
      statusElement.textContent = ownProfile.is_active
        ? "Profile status: Active — visible in the tutor directory."
        : "Profile status: Hidden — not visible in the tutor directory.";

      statusElement.style.fontWeight = "bold";
    }
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
  const totalTutoringRequestsPages = Math.max(
  1,
  Math.ceil(ownRequests.length / tutoringRequestsPerPage)
);

if (currentTutoringRequestsPage > totalTutoringRequestsPages) {
  currentTutoringRequestsPage = totalTutoringRequestsPages;
}

const requestStartIndex =
  (currentTutoringRequestsPage - 1) * tutoringRequestsPerPage;

const paginatedRequests = ownRequests.slice(
  requestStartIndex,
  requestStartIndex + tutoringRequestsPerPage
);

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

 paginatedRequests.forEach(request => {
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
  const requestsPrevious = document.getElementById("tutoringRequestsPrevious");
const requestsNext = document.getElementById("tutoringRequestsNext");
const requestsPageInfo = document.getElementById("tutoringRequestsPageInfo");

if (requestsPageInfo) {
  requestsPageInfo.textContent =
    `Page ${currentTutoringRequestsPage} of ${totalTutoringRequestsPages}`;
}

if (requestsPrevious) {
  requestsPrevious.disabled = currentTutoringRequestsPage <= 1;

  requestsPrevious.onclick = async function () {
    if (currentTutoringRequestsPage > 1) {
      currentTutoringRequestsPage--;
      await loadTutoringData();
    }
  };
}

if (requestsNext) {
  requestsNext.disabled =
    currentTutoringRequestsPage >= totalTutoringRequestsPages;

  requestsNext.onclick = async function () {
    if (currentTutoringRequestsPage < totalTutoringRequestsPages) {
      currentTutoringRequestsPage++;
      await loadTutoringData();
    }
  };
}
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
          is_active: true,
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

const tutorBankDetailsForm = document.getElementById("tutorBankDetailsForm");

if (tutorBankDetailsForm) {
  const bankMessage = document.getElementById("tutorBankDetailsMessage");

  async function loadTutorBankDetails() {
    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) return;

    const { data, error } = await supabaseClient
      .from("tutor_bank_details")
      .select("bank_name, account_name, account_number")
      .eq("tutor_id", authData.user.id)
      .maybeSingle();

    if (error) {
      bankMessage.textContent = "Could not load bank details.";
      console.error("Bank details loading error:", error);
      return;
    }

    if (data) {
      document.getElementById("tutorBankName").value = data.bank_name;
      document.getElementById("tutorBankAccountName").value = data.account_name;
      document.getElementById("tutorBankAccountNumber").value =
        data.account_number;
    }
  }

  tutorBankDetailsForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton =
      tutorBankDetailsForm.querySelector('button[type="submit"]');

    const bankName = document.getElementById("tutorBankName").value.trim();
    const accountName =
      document.getElementById("tutorBankAccountName").value.trim();
    const accountNumber =
      document.getElementById("tutorBankAccountNumber").value.trim();

    if (!bankName || !accountName || !/^\d{10}$/.test(accountNumber)) {
      bankMessage.textContent =
        "Enter your bank name, account name and valid 10-digit account number.";
      return;
    }

    submitButton.disabled = true;
    bankMessage.textContent = "Saving bank details...";

    try {
      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Please sign in before saving bank details.");
      }

      const { error } = await supabaseClient
        .from("tutor_bank_details")
        .upsert({
          tutor_id: authData.user.id,
          bank_name: bankName,
          account_name: accountName,
          account_number: accountNumber,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      bankMessage.textContent = "Bank details saved successfully!";
    } catch (error) {
      bankMessage.textContent =
        "Could not save bank details: " + error.message;
      console.error("StudyFlow bank details error:", error);
    } finally {
      submitButton.disabled = false;
    }
  });

  loadTutorBankDetails();
}


const tutorPayoutButton = document.getElementById(
  "requestTutorPayoutButton"
);

if (tutorPayoutButton) {
  const payoutMessage = document.getElementById(
    "tutorPayoutRequestMessage"
  );

  const formatTutorMoney = amount =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN"
    }).format(Number(amount || 0));

  async function loadTutorPayoutDashboard() {
    const history = document.getElementById(
      "tutorPayoutRequestHistory"
    );

    try {
      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Please sign in to view your earnings.");
      }

      const tutorId = authData.user.id;

      const [
        tutoringResult,
        materialResult,
        itemsResult,
        requestsResult
      ] = await Promise.all([
        supabaseClient
          .from("tutor_payouts")
          .select("id, tutor_earning_ngn, payout_status")
          .eq("tutor_id", tutorId),

        supabaseClient
          .from("material_tutor_payouts")
          .select("id, tutor_earning_ngn, payout_status")
          .eq("tutor_id", tutorId),

        supabaseClient
          .from("tutor_payout_request_items")
          .select("tutor_payout_id, material_payout_id"),

        supabaseClient
          .from("tutor_payout_requests")
          .select("id, amount_ngn, status, requested_at, payout_reference")
          .eq("tutor_id", tutorId)
          .order("requested_at", { ascending: false })
      ]);

      const results = [
        tutoringResult,
        materialResult,
        itemsResult,
        requestsResult
      ];

      const failedResult = results.find(result => result.error);

      if (failedResult) throw failedResult.error;

      const tutoring = tutoringResult.data || [];
      const materials = materialResult.data || [];
      const items = itemsResult.data || [];
      const requests = requestsResult.data || [];

      const claimedTutoring = new Set(
        items.map(item => item.tutor_payout_id).filter(Boolean)
      );

      const claimedMaterials = new Set(
        items.map(item => item.material_payout_id).filter(Boolean)
      );

      const availableTutoring = tutoring
        .filter(p =>
          p.payout_status === "Ready for payout" &&
          !claimedTutoring.has(p.id)
        )
        .reduce((sum, p) => sum + Number(p.tutor_earning_ngn), 0);

      const availableMaterials = materials
        .filter(p =>
          p.payout_status === "Ready for payout" &&
          !claimedMaterials.has(p.id)
        )
        .reduce((sum, p) => sum + Number(p.tutor_earning_ngn), 0);

      const totalAvailable =
        availableTutoring + availableMaterials;

      const totalPending = requests
        .filter(r =>
          ["Pending", "Approved"].includes(r.status)
        )
        .reduce((sum, r) => sum + Number(r.amount_ngn), 0);

      const totalPaid = [...tutoring, ...materials]
        .filter(p => p.payout_status === "Paid")
        .reduce((sum, p) => sum + Number(p.tutor_earning_ngn), 0);

      document.getElementById(
        "tutorAvailableEarnings"
      ).textContent = formatTutorMoney(totalAvailable);

      document.getElementById(
        "tutorPendingEarnings"
      ).textContent = formatTutorMoney(totalPending);

      document.getElementById(
        "tutorTotalPaid"
      ).textContent = formatTutorMoney(totalPaid);

      history.replaceChildren();

      if (!requests.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "You have not submitted any payout requests.";
        history.appendChild(empty);
      } else {
        requests.forEach(request => {
          const entry = document.createElement("div");
          entry.className = "payout-history-item";
          entry.style.padding = "12px 0";
          entry.style.borderBottom = "1px solid var(--border-color, #ddd)";

          const amount = document.createElement("strong");
          amount.textContent = formatTutorMoney(request.amount_ngn);

          const status = document.createElement("p");
          status.className = "muted";
          status.textContent = "Status: " + request.status;

          const date = document.createElement("small");
          date.textContent = new Date(
            request.requested_at
          ).toLocaleString("en-NG");

          entry.append(amount, status, date);

          if (request.payout_reference) {
            const reference = document.createElement("p");
            reference.textContent =
              "Payout reference: " + request.payout_reference;
            entry.appendChild(reference);
          }

          history.appendChild(entry);
        });
      }

      tutorPayoutButton.disabled = totalAvailable <= 0;
    } catch (error) {
      payoutMessage.textContent =
        "Could not load payout information: " + error.message;

      console.error("Tutor payout dashboard error:", error);
    }
  }

  tutorPayoutButton.addEventListener("click", async () => {
    tutorPayoutButton.disabled = true;
    payoutMessage.textContent = "Submitting your payout request...";

    try {
      const { data, error } = await supabaseClient.rpc(
        "request_tutor_payout"
      );

      if (error) throw error;

      const request = Array.isArray(data) ? data[0] : data;

      if (!request) {
        throw new Error("No payout request information was returned.");
      }

      payoutMessage.textContent =
        "Payout request submitted successfully. Amount: " +
        formatTutorMoney(request.amount_ngn);

      await loadTutorPayoutDashboard();
    } catch (error) {
      payoutMessage.textContent =
        "Payout request failed: " + error.message;

      console.error("Tutor payout request error:", error);
      tutorPayoutButton.disabled = false;
    }
  });

  loadTutorPayoutDashboard();
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
 const known = ["dashboard","assignments","subjects","calendar","tutoring","materials","courses","payouts","quizzes","messages"];

  if (!known.includes(view)) view = "dashboard";

  if (view === "quizzes") {
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

  if (error) {
    alert("Could not verify your account role.");
    return;
  }

  const canManageQuizzes = roles?.some(item =>
    ["admin", "tutor"].includes(item.role)
  );

  document.getElementById("quizCreatorPanel").hidden = !canManageQuizzes;
  document.getElementById("managedQuizResultsPanel").hidden = !canManageQuizzes;
}

  if (view === "courses") {
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

  if (error) {
    alert("Could not verify your account role.");
    return;
  }

  const canCreateCourses = roles?.some(item =>
    ["admin", "tutor"].includes(item.role)
  );

  const isAdmin = roles?.some(item => item.role === "admin");
    if (isAdmin) {
  await loadAdminCourses();
}

  document.getElementById("courseCreatorPanel").style.display =
    canCreateCourses ? "" : "none";

  document.getElementById("courseAdminPanel").style.display =
    isAdmin ? "" : "none";
    document.getElementById("courseContentManagerPanel").style.display =
    canCreateCourses ? "" : "none";
}
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
  if (view === "courses") loadStudyCourses();
  if (view === "courses") loadMyCourses();
  if (view === "courses") loadMyCourseCertificates();
  if (view === "payouts") loadTutorPayouts();
  if (view === "payouts") loadMaterialTutorPayouts();
  if (view === "payouts") loadTutorPayoutRequests();
  if (view === "quizzes") loadQuizzes();
  if (view === "quizzes") loadManagedQuizResults();
 if (view === "messages") {
  loadTutorConversations();
  updateUnreadMessageCount();
}

  window.scrollTo({top:0, behavior:"smooth"});
}

let activeTutorConversationId = null;
async function updateUnreadMessageCount() {
  const countBadge = document.getElementById("unreadMessageCount");
  if (!countBadge) return;

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    countBadge.hidden = true;
    return;
  }

  const { data: conversations, error: conversationError } =
    await supabaseClient
      .from("tutor_conversations")
      .select("id");

  if (conversationError || !conversations?.length) {
    countBadge.hidden = true;
    return;
  }

  const conversationIds = conversations.map(item => item.id);

  const { count, error } = await supabaseClient
    .from("tutor_messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", conversationIds)
    .neq("sender_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("Unread message count error:", error);
    return;
  }

  const unread = count || 0;
  countBadge.textContent = unread;
  countBadge.hidden = unread === 0;
}
async function loadTutorConversations() {
  const list = document.getElementById("tutorConversationList");
  const messagePanel = document.getElementById("tutorMessagePanel");

  messagePanel.hidden = true;
  list.textContent = "Loading your conversations...";

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  const user = authData?.user;

  if (authError || !user) {
    list.textContent = "Please sign in to view your conversations.";
    return;
  }

  const { data: conversations, error } = await supabaseClient
    .from("tutor_conversations")
    .select("id, request_id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Conversation loading error:", error);
    list.textContent = "Could not load conversations. Please try again.";
    return;
  }

  if (!conversations?.length) {
    list.textContent = "You have no paid tutoring conversations yet.";
    return;
  }

  const requestIds = conversations.map(item => item.request_id);

  const { data: requests, error: requestError } = await supabaseClient
    .from("tutoring_requests")
    .select("id, subject, student_id, tutor_id")
    .in("id", requestIds);

  if (requestError) {
    console.error("Tutoring request loading error:", requestError);
    list.textContent = "Could not load tutoring request details.";
    return;
  }

  const tutorIds = [...new Set((requests || []).map(item => item.tutor_id))];

  const { data: tutors, error: tutorError } = await supabaseClient
    .from("tutor_profiles")
    .select("id, display_name")
    .in("id", tutorIds);

  if (tutorError) {
    console.error("Tutor profile loading error:", tutorError);
    list.textContent = "Could not load tutor details.";
    return;
  }

  const requestMap = new Map((requests || []).map(item => [item.id, item]));
  const tutorMap = new Map((tutors || []).map(item => [item.id, item]));

  list.replaceChildren();

  conversations.forEach(conversation => {
    const request = requestMap.get(conversation.request_id);
    if (!request) return;

    const isStudent = request.student_id === user.id;
    const tutor = tutorMap.get(request.tutor_id);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.style.cssText =
      "display:block;width:100%;text-align:left;padding:14px;margin:8px 0;border:1px solid var(--border);border-radius:10px;background:var(--surface);cursor:pointer;";

    const subject = document.createElement("strong");
    subject.textContent = request.subject || "Tutoring session";

    const participant = document.createElement("span");
    participant.style.display = "block";
    participant.textContent = isStudent
      ? `Tutor: ${tutor?.display_name || "Your tutor"}`
      : "Student conversation";

    button.append(subject, participant);

    button.addEventListener("click", () => {
      activeTutorConversationId = conversation.id;
      subscribeToTutorMessages();
      document.getElementById("tutorMessageHeading").textContent =
        request.subject || "Tutoring conversation";
      messagePanel.hidden = false;
     loadTutorMessages();
      document.getElementById("tutorMessageInput").focus();
    });

    list.appendChild(button);
  });

  if (!list.children.length) {
    list.textContent = "No conversations are available for this account.";
  }
}

async function loadTutorMessages() {
  const messagesList = document.getElementById("tutorMessagesList");
  messagesList.textContent = "Loading messages...";

  if (!activeTutorConversationId) {
    messagesList.textContent = "Select a conversation first.";
    return;
  }

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    messagesList.textContent = "Please sign in again.";
    return;
  }
  const { error: readError } = await supabaseClient.rpc(
  "mark_tutor_conversation_read",
  {
    p_conversation_id: activeTutorConversationId
  }
);

if (readError) {
  console.error("Could not mark messages as read:", readError);
} else {
  await updateUnreadMessageCount();
}

  const { data: messages, error } = await supabaseClient
    .from("tutor_messages")
    .select("id, sender_id, message, created_at, read_at")
    .eq("conversation_id", activeTutorConversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Message loading error:", error);
    messagesList.textContent = "Could not load messages.";
    return;
  }

  messagesList.replaceChildren();

  if (!messages?.length) {
    messagesList.textContent =
      "No messages yet. Send the first message!";
    return;
  }

  messages.forEach(item => {
    const bubble = document.createElement("div");
    const ownMessage = item.sender_id === user.id;
    

    bubble.style.cssText = `
      max-width:80%;
      width:fit-content;
      padding:10px 14px;
      margin:10px 0;
      border-radius:12px;
      ${ownMessage ? "margin-left:auto;background:var(--primary);color:white;" : "margin-right:auto;background:var(--surface);border:1px solid var(--border);"}
    `;

    const messageText = document.createElement("p");
    messageText.textContent = item.message;
    messageText.style.margin = "0";

    const timestamp = document.createElement("small");
    timestamp.textContent = new Date(item.created_at).toLocaleString();

    if (ownMessage && item.read_at) {
      const readReceipt = document.createElement("small");
      readReceipt.textContent = " · Seen";
      readReceipt.style.marginLeft = "6px";
      bubble.append(messageText, timestamp, readReceipt);
    } else {
      bubble.append(messageText, timestamp);
    }
        messagesList.appendChild(bubble);
      });

  messagesList.scrollTop = messagesList.scrollHeight;
}
let tutorMessagesChannel = null;


function subscribeToTutorMessages() {
  if (tutorMessagesChannel) {
    supabaseClient.removeChannel(tutorMessagesChannel);
    tutorMessagesChannel = null;
  }

  tutorMessagesChannel = supabaseClient
    .channel("tutor-messages-all-conversations")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tutor_messages"
      },
      async (payload) => {
        const newMessage = payload.new;

        await updateUnreadMessageCount();

        if (
          activeTutorConversationId === newMessage.conversation_id
        ) {
          await loadTutorMessages();
        }

        const { data: authData } =
          await supabaseClient.auth.getUser();

        const user = authData?.user;

        if (
          user &&
          newMessage.sender_id !== user.id &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("New StudyFlow Message", {
            body: newMessage.message,
            icon: "/favicon.ico"
          });
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tutor_messages"
      },
      (payload) => {
        if (
          activeTutorConversationId === payload.new.conversation_id
        ) {
          loadTutorMessages();
        }
      }
    )
    .subscribe();
}

const enableMessageNotifications =
  document.getElementById("enableMessageNotifications");

if (enableMessageNotifications) {
  enableMessageNotifications.addEventListener("click", async () => {
    try {
      if (!("Notification" in window)) {
        enableMessageNotifications.textContent =
          "Notifications Not Supported";
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        enableMessageNotifications.textContent =
          "Notifications Enabled";

        new Notification("StudyFlow Notifications Enabled", {
          body: "You can now receive new message alerts."
        });
      } else {
        enableMessageNotifications.textContent =
          "Notifications Not Enabled";
      }
    } catch (error) {
      console.error("Message notification error:", error);
    }
  });
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
  await loadAdminPaymentMode();

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


async function loadAdminPaymentMode() {
  const panel = document.getElementById("adminPaymentModePanel");
  const status = document.getElementById("adminPaymentModeStatus");
  const button = document.getElementById("adminPaymentModeToggle");
  const message = document.getElementById("adminPaymentModeMessage");

  if (!panel || !status || !button || !message) return;

  message.textContent = "Loading payment settings...";
  button.disabled = true;

  const { data, error } = await supabaseClient.functions.invoke(
    "Paystack-Payment",
    {
      body: { action: "get_payment_mode" }
    }
  );

  if (error || !data?.success) {
    message.textContent =
      data?.error || "Unable to load payment mode.";
    return;
  }

  panel.dataset.mode = data.mode;

  status.textContent = data.mode.toUpperCase();

  button.textContent =
    data.mode === "live"
      ? "Switch to Test Mode"
      : "Switch to Live Mode";

  message.textContent = "Only administrators can change this setting.";

  button.disabled = false;
  button.onclick = toggleAdminPaymentMode;
}


async function toggleAdminPaymentMode() {
  const panel = document.getElementById("adminPaymentModePanel");
  const button = document.getElementById("adminPaymentModeToggle");
  const message = document.getElementById("adminPaymentModeMessage");

  if (!panel || !button || !message) return;

  const currentMode = panel.dataset.mode;
  const nextMode = currentMode === "live" ? "test" : "live";

  const confirmation = nextMode === "live"
    ? "Switch to LIVE mode? Real customer payments will be processed."
    : "Switch to TEST mode? Real customer payments will be disabled.";

  if (!confirm(confirmation)) return;

  button.disabled = true;
  message.textContent = "Updating payment mode...";

  const { data, error } = await supabaseClient.functions.invoke(
    "Paystack-Payment",
    {
      body: {
        action: "set_payment_mode",
        mode: nextMode
      }
    }
  );

  if (error || !data?.success) {
    message.textContent =
      data?.error || "Unable to change payment mode.";
    button.disabled = false;
    return;
  }

  await loadAdminPaymentMode();
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
// StudyFlow public homepage buttons
const publicHomepage = document.getElementById("public-homepage");
document.getElementById("footer-features")
  ?.addEventListener("click", (event) => {
    event.preventDefault();
    publicHomepage.hidden = false;
    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-content").hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

document.getElementById("public-login-button")?.addEventListener("click", () => {
  publicHomepage.hidden = true;
  document.getElementById("auth-section").hidden = false;
});

document.getElementById("public-signup-button")?.addEventListener("click", () => {
  publicHomepage.hidden = true;
  document.getElementById("auth-section").hidden = false;
  document.getElementById("auth-form").hidden = false;
  document.getElementById("login-button").hidden = true;
  document.getElementById("signup-button").hidden = false;
});

document.getElementById("public-get-started-button")?.addEventListener("click", () => {
  document.getElementById("public-signup-button").click();
});
let openTutoringAfterLogin = false;

document.getElementById("public-explore-tutors-button")
  ?.addEventListener("click", () => {
    openTutoringAfterLogin = true;

    document.getElementById("public-homepage").hidden = true;
    document.getElementById("auth-section").hidden = false;
    document.getElementById("auth-form").hidden = false;
    document.getElementById("login-button").hidden = false;
    document.getElementById("signup-button").hidden = false;
  });
document.getElementById("footer-find-tutor")
  ?.addEventListener("click", async (event) => {
    event.preventDefault();

    const { data: authData } = await supabaseClient.auth.getUser();

    if (authData?.user) {
      setView("tutoring");
    } else {
      document.getElementById("public-explore-tutors-button")?.click();
    }
  });
function updateAuthUI(user) {
  const authSection = document.getElementById("auth-section");
  const dashboard = document.getElementById("dashboard-content");

const publicHomepage = document.getElementById("public-homepage");
const resetSection = document.getElementById("reset-password-section");
const isResettingPassword = resetSection && !resetSection.hidden;

if (publicHomepage) {
  publicHomepage.hidden = Boolean(user) || isResettingPassword;
}

if (authSection) {
  authSection.hidden =
    Boolean(user) || (!publicHomepage.hidden) || isResettingPassword;
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

if (openTutoringAfterLogin) {
  openTutoringAfterLogin = false;
  setView("tutoring");
}

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
    await loadPremiumMembershipStatus();
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
   .select("id, title, description, subject, category, file_path, file_name, uploader_id, created_at, price, has_video")
   .order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = "<p>Unable to load study materials. Please try again.</p>";
    console.error(error);
    return;
  }

  renderStudyMaterials(materials || []);
}

let currentPayoutsPage = 1;
const payoutsPerPage = 10;
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

let totalPayoutPages = 1;

if (!payouts || payouts.length === 0) {
  html += "<p>No tutor payouts available yet.</p>";
} else {
  totalPayoutPages = Math.max(
    1,
    Math.ceil(payouts.length / payoutsPerPage)
  );

  if (currentPayoutsPage > totalPayoutPages) {
    currentPayoutsPage = totalPayoutPages;
  }

  const startIndex = (currentPayoutsPage - 1) * payoutsPerPage;

  const paginatedPayouts = payouts.slice(
    startIndex,
    startIndex + payoutsPerPage
  );

  html += paginatedPayouts.map(payout => `
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

  const payoutsPrevious = document.getElementById("payoutsPrevious");
const payoutsNext = document.getElementById("payoutsNext");
const payoutsPageInfo = document.getElementById("payoutsPageInfo");

if (payoutsPageInfo) {
  payoutsPageInfo.textContent =
    `Page ${currentPayoutsPage} of ${totalPayoutPages}`;
}

if (payoutsPrevious) {
  payoutsPrevious.disabled = currentPayoutsPage <= 1;
  payoutsPrevious.onclick = async function () {
    if (currentPayoutsPage > 1) {
      currentPayoutsPage--;
      await loadTutorPayouts();
    }
  };
}

if (payoutsNext) {
  payoutsNext.disabled = currentPayoutsPage >= totalPayoutPages;
  payoutsNext.onclick = async function () {
    if (currentPayoutsPage < totalPayoutPages) {
      currentPayoutsPage++;
      await loadTutorPayouts();
    }
  };
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

async function loadMaterialTutorPayouts() {
  const list = document.getElementById("materialPayoutsList");
  const summary = document.getElementById("materialPayoutsSummary");

  if (!list || !summary) return;

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    list.textContent = "Please sign in first.";
    summary.textContent = "";
    return;
  }

  const { data: roles, error: roleError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = !roleError && roles?.some(item => item.role === "admin");

  if (!isAdmin) {
    list.textContent = "Administrator access required.";
    summary.textContent = "";
    return;
  }

  list.textContent = "Loading material tutor payouts...";
  summary.textContent = "";

  const { data: payouts, error } = await supabaseClient
    .from("material_tutor_payouts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Unable to load material tutor payouts.";
    console.error(error);
    return;
  }

  const tutorIds = [...new Set((payouts || []).map(p => p.tutor_id))];

  let tutorNames = {};

  if (tutorIds.length > 0) {
    const { data: tutors, error: tutorError } = await supabaseClient
      .from("tutor_profiles")
      .select("id, display_name")
      .in("id", tutorIds);

    if (tutorError) {
      console.error("Could not load tutor names:", tutorError);
    } else {
      tutorNames = Object.fromEntries(
        (tutors || []).map(t => [t.id, t.display_name])
      );
    }
  }

  const money = amount =>
    "₦" + Number(amount || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const totalSales = (payouts || []).reduce(
    (sum, p) => sum + Number(p.student_payment_ngn || 0), 0
  );

  const totalCommission = (payouts || []).reduce(
    (sum, p) => sum + Number(p.platform_commission_ngn || 0), 0
  );

  const totalTutorEarnings = (payouts || []).reduce(
    (sum, p) => sum + Number(p.tutor_earning_ngn || 0), 0
  );

  const readyPayouts = (payouts || []).filter(
    p => p.payout_status === "Ready for payout"
  );

  const readyAmount = readyPayouts.reduce(
    (sum, p) => sum + Number(p.tutor_earning_ngn || 0), 0
  );

  summary.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <p><strong>Total material sales:</strong> ${money(totalSales)}</p>
      <p><strong>StudyFlow commission:</strong> ${money(totalCommission)}</p>
      <p><strong>Total tutor earnings:</strong> ${money(totalTutorEarnings)}</p>
      <p><strong>Awaiting tutor payout:</strong> ${money(readyAmount)}</p>
      <p><strong>Records awaiting payment:</strong> ${readyPayouts.length}</p>
    </div>
  `;

  if (!payouts || payouts.length === 0) {
    list.innerHTML = "<p>No material tutor payouts available yet.</p>";
    return;
  }

  list.innerHTML = payouts.map(payout => {
    const tutorName = tutorNames[payout.tutor_id] || "Tutor";
    const isReady = payout.payout_status === "Ready for payout";

    return `
      <div class="panel" style="margin-top:12px;">
        <h3>${escapeHtml(tutorName)}</h3>

        <p><strong>Tutor ID:</strong>
          ${escapeHtml(payout.tutor_id)}
        </p>

        <p><strong>Student payment:</strong>
          ${money(payout.student_payment_ngn)}
        </p>

        <p><strong>StudyFlow commission:</strong>
          ${money(payout.platform_commission_ngn)}
        </p>

        <p><strong>Tutor earnings:</strong>
          ${money(payout.tutor_earning_ngn)}
        </p>

        <p><strong>Status:</strong>
          ${escapeHtml(payout.payout_status)}
        </p>

        ${payout.payout_reference ? `
          <p><strong>Transfer reference:</strong>
            ${escapeHtml(payout.payout_reference)}
          </p>
        ` : ""}

        ${payout.paid_at ? `
          <p><strong>Paid at:</strong>
            ${escapeHtml(new Date(payout.paid_at).toLocaleString("en-NG"))}
          </p>
        ` : ""}

        ${isReady ? `
          <button
            class="primary-btn"
            type="button"
            data-material-mark-paid="${escapeHtml(payout.id)}"
          >
            Mark Material Payout as Paid
          </button>
        ` : ""}
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-material-mark-paid]").forEach(button => {
    button.addEventListener("click", async () => {
      const payoutId = button.dataset.materialMarkPaid;

      const reference = prompt(
        "Enter the bank transfer reference from your bank receipt:"
      );

      if (reference === null) return;

      const cleanReference = reference.trim();

      if (!cleanReference || cleanReference.length > 200) {
        alert("Enter a valid transfer reference (1–200 characters).");
        return;
      }

      if (!confirm(
        "Have you already transferred the tutor's earnings to their bank account?"
      )) {
        return;
      }

      button.disabled = true;
      button.textContent = "Saving...";

      const { error: payoutError } = await supabaseClient.rpc(
        "mark_material_tutor_payout_paid",
        {
          p_payout_id: payoutId,
          p_payout_reference: cleanReference
        }
      );

      if (payoutError) {
        alert("Could not record material payout: " + payoutError.message);
        button.disabled = false;
        button.textContent = "Mark Material Payout as Paid";
        return;
      }

      alert("Material tutor payout recorded successfully.");
      await loadMaterialTutorPayouts();
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

  const sortOrder =
    document.getElementById("materialSort")?.value || "newest";

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

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / materialsPerPage)
  );

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
    else if (item.has_video) fileIcon = "🎥";

    const uploadDate = item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : "Date unavailable";

    return `
      <div class="panel" style="margin-top:15px;">
        <h3>${fileIcon} ${escapeHtml(item.title)}</h3>
        <p><strong>Subject:</strong> ${escapeHtml(item.subject)}</p>
        <p><strong>Category:</strong> ${escapeHtml(item.category || "Notes")}</p>
        <p><strong>Price:</strong> ₦${Number(item.price || 0).toLocaleString("en-NG")}</p>
        <p><strong>Uploaded:</strong> ${uploadDate}</p>
        <p>${escapeHtml(item.description || "")}</p>
        
<div class="social-share-section">
  <p><strong>Share this study material:</strong></p>
  <button type="button"
    data-share-material="${escapeHtml(item.id)}"
    data-share-platform="whatsapp">WhatsApp</button>

  <button type="button"
    data-share-material="${escapeHtml(item.id)}"
    data-share-platform="facebook">Facebook</button>

  <button type="button"
    data-share-material="${escapeHtml(item.id)}"
    data-share-platform="x">X</button>

  <button type="button"
    data-share-material="${escapeHtml(item.id)}"
    data-share-platform="copy">Copy Link</button>
</div>


        ${item.file_path
          ? `<button class="secondary-btn" onclick="downloadStudyMaterial('${item.id}')">Download Material</button>`
          : ""}

        ${item.has_video
          ? `<p><button class="secondary-btn" onclick="watchStudyMaterial('${item.id}')">🎥 Watch Video</button></p>`
          : ""}

        <div id="materialActions-${item.id}"></div>
      </div>
    `;
  }).join("");
    const previousButton = document.getElementById("materialsPrevious");
  const nextButton = document.getElementById("materialsNext");

  if (previousButton) {
    previousButton.onclick = async function () {
      if (currentMaterialsPage > 1) {
        currentMaterialsPage--;
        await loadStudyMaterials();
      }
    };
  }

  if (nextButton) {
    nextButton.onclick = async function () {
      if (currentMaterialsPage < totalPages) {
        currentMaterialsPage++;
        await loadStudyMaterials();
      }
    };
  }
  list.onclick = async function (event) {
    const button = event.target.closest("[data-share-material]");
    if (!button) return;

    const materialId = button.dataset.shareMaterial;
    const platform = button.dataset.sharePlatform;

    const material = filtered.find(
      item => item.id === materialId
    );

    if (!material) return;

    const shareUrl =
      window.location.origin +
      window.location.pathname +
      "#materialsView";

    const shareText =
      `Check out "${material.title}" on StudyFlow Study Materials!`;

    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    if (platform === "whatsapp") {
      window.open(
        `https://wa.me/?text=${text}%20${url}`,
        "_blank"
      );
    } else if (platform === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        "_blank"
      );
    } else if (platform === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
        "_blank"
      );
    } else if (platform === "copy") {
      try {
        await navigator.clipboard.writeText(
          `${shareText} ${shareUrl}`
        );
        alert("Study material sharing link copied!");
      } catch (error) {
        alert("Unable to copy. Please copy the website address manually.");
      }
    }
  };


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
  const price = Number(document.getElementById("materialPrice").value);
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

  if (!Number.isFinite(price) || price < 0) {
    message.textContent = "Please enter a valid price.";
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

  // Save material details without exposing the video URL.
  const { data: material, error: materialError } = await supabaseClient
    .from("study_materials")
    .insert({
      title,
      subject,
      category,
      description,
      price,
      file_path: filePath,
      file_name: file?.name || null,
      has_video: Boolean(videoUrl),
      uploader_id: user.id
    })
    .select("id")
    .single();

  if (materialError || !material) {
    if (filePath) {
      await supabaseClient.storage
        .from("study-materials")
        .remove([filePath]);
    }

    message.textContent =
      "Could not save material: " +
      (materialError?.message || "Unknown error");
    return;
  }

  // Save the video URL in the protected table.
  if (videoUrl) {
    const { error: videoError } = await supabaseClient
      .from("study_material_videos")
      .insert({
        material_id: material.id,
        video_url: videoUrl
      });

    if (videoError) {
      await supabaseClient
        .from("study_materials")
        .delete()
        .eq("id", material.id);

      if (filePath) {
        await supabaseClient.storage
          .from("study-materials")
          .remove([filePath]);
      }

      message.textContent =
        "Could not save video link: " + videoError.message;
      return;
    }
  }

  document.getElementById("materialUploadForm").reset();
  message.textContent = "Study material uploaded successfully!";

  await loadStudyMaterials();
}


async function downloadStudyMaterial(id) {
  try {
    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;

    if (!user) {
      alert("Please sign in first.");
      return;
    }

    const { data: material, error } = await supabaseClient
      .from("study_materials")
      .select("id, title, price, file_path, file_name, uploader_id")
      .eq("id", id)
      .single();

    if (error || !material?.file_path) {
      alert("Material file not found.");
      return;
    }

    const { data: roles } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some(item => item.role === "admin");
    const isUploader = material.uploader_id === user.id;
    const isFree = Number(material.price || 0) <= 0;

    let hasPaid = false;
    let hasPremium = false;

    if (!isFree && !isAdmin && !isUploader) {
      const { data: purchases, error: purchaseError } =
        await supabaseClient
          .from("material_purchases")
          .select("id")
          .eq("material_id", material.id)
          .eq("user_id", user.id)
          .eq("status", "success")
          .limit(1);

      if (purchaseError) {
        alert("Could not check your purchase. Please try again.");
        return;
      }

      hasPaid = purchases?.length > 0;

      const { data: memberships, error: membershipError } =
        await supabaseClient
          .from("premium_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .limit(1);

      if (membershipError) {
        alert("Could not check your Premium membership. Please try again.");
        return;
      }

      hasPremium = memberships?.length > 0;
    }

    if (
      !isFree &&
      !isAdmin &&
      !isUploader &&
      !hasPaid &&
      !hasPremium
    ) {
      const { data: paymentData, error: paymentError } =
        await supabaseClient.functions.invoke("Paystack-Payment", {
          body: {
            action: "initialize",
            materialId: material.id
          }
        });

      if (paymentError || !paymentData?.authorization_url) {
        alert(
          paymentData?.error ||
          paymentError?.message ||
          "Could not start payment. Please try again."
        );
        return;
      }

      localStorage.setItem(
        "studyflow.pendingPurchaseAction",
        "download"
      );

      window.location.assign(paymentData.authorization_url);
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

  } catch (error) {
    console.error("Study material download error:", error);
    alert("Something went wrong. Please try again.");
  }
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
    .select("id, title, subject, category, description")
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
  await loadStudyMaterials();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// ===============================
// STUDYFLOW QUIZ CREATION
// ===============================

function addQuizQuestion() {
  const builder = document.getElementById("quizQuestionBuilder");
  if (!builder) return;

  const number = builder.children.length + 1;

  const question = document.createElement("div");
  question.className = "panel quiz-question-item";
  question.style.marginTop = "15px";

  question.innerHTML = `
    <h3>Question ${number}</h3>

    <label>Question</label>
    <textarea class="quiz-question-text"
      placeholder="Enter your question" required></textarea>

    <label>Option A</label>
    <input class="quiz-option" required placeholder="Option A">

    <label>Option B</label>
    <input class="quiz-option" required placeholder="Option B">

    <label>Option C</label>
    <input class="quiz-option" required placeholder="Option C">

    <label>Option D</label>
    <input class="quiz-option" required placeholder="Option D">

    <label>Correct answer</label>
    <select class="quiz-correct-answer">
      <option value="0">Option A</option>
      <option value="1">Option B</option>
      <option value="2">Option C</option>
      <option value="3">Option D</option>
    </select>

    <button type="button" class="secondary-btn remove-quiz-question">
      Remove Question
    </button>
  `;

  builder.appendChild(question);
}
let currentQuizzesPage = 1;
const quizzesPerPage = 10;
async function loadQuizzes() {
  const list = document.getElementById("quizzesList");
  if (!list) return;

  list.innerHTML = '<p class="muted">Loading quizzes...</p>';

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;

  if (!user) {
    list.textContent = "Please sign in to view quizzes.";
    return;
  }

  const { data: roles, error: roleError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) {
    list.textContent = "Could not check your account permissions.";
    return;
  }

  const isAdmin = roles?.some(item => item.role === "admin");
  const canManage = roles?.some(item =>
    ["admin", "tutor"].includes(item.role)
  );

  const { data: quizzes, error } = await supabaseClient
    .from("quizzes")
    .select("id, created_by, title, subject, description, is_published, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load quizzes: " + error.message;
    return;
  }

  if (!quizzes?.length) {
    list.innerHTML = '<p class="muted">No published quizzes available yet.</p>';
  } else {
    const totalQuizPages = Math.max(
  1,
  Math.ceil(quizzes.length / quizzesPerPage)
);

if (currentQuizzesPage > totalQuizPages) {
  currentQuizzesPage = totalQuizPages;
}

const startIndex = (currentQuizzesPage - 1) * quizzesPerPage;

const paginatedQuizzes = quizzes.slice(
  startIndex,
  startIndex + quizzesPerPage
);
    list.innerHTML = paginatedQuizzes.map(quiz => {
      const canEdit = canManage &&
        (isAdmin || quiz.created_by === user.id);

      return `
        <div class="panel" style="margin-top:12px;">
          <h3>${escapeHtml(quiz.title)}</h3>
          <p><strong>Subject:</strong> ${escapeHtml(quiz.subject)}</p>
          <p>${escapeHtml(quiz.description || "")}</p>
          ${canManage ? `<p class="muted">${quiz.is_published ? "Published" : "Draft"}</p>` : ""}
          ${canEdit ? `
            <button
              type="button"
              class="secondary-btn edit-quiz-button"
              data-quiz-id="${escapeHtml(quiz.id)}">
              Edit Details
            </button>
            <button
              type="button"
              class="secondary-btn edit-quiz-questions-button"
              data-quiz-id="${escapeHtml(quiz.id)}">
              Edit Questions
            </button>
          ` : ""}
         <button
          type="button"
          class="primary-btn take-quiz-button"
          data-quiz-id="${escapeHtml(quiz.id)}">
          Take Quiz
        </button>
        </div>
      `;
    }).join("");
        const quizzesPrevious = document.getElementById("quizzesPrevious");
    const quizzesNext = document.getElementById("quizzesNext");
    const quizzesPageInfo = document.getElementById("quizzesPageInfo");

    if (quizzesPageInfo) {
      quizzesPageInfo.textContent =
        `Page ${currentQuizzesPage} of ${totalQuizPages}`;
    }

    if (quizzesPrevious) {
      quizzesPrevious.disabled = currentQuizzesPage <= 1;
      quizzesPrevious.onclick = async function () {
        if (currentQuizzesPage > 1) {
          currentQuizzesPage--;
          await loadQuizzes();
        }
      };
    }

    if (quizzesNext) {
      quizzesNext.disabled = currentQuizzesPage >= totalQuizPages;
      quizzesNext.onclick = async function () {
        if (currentQuizzesPage < totalQuizPages) {
          currentQuizzesPage++;
          await loadQuizzes();
        }
      };
    }
  }

  const builder = document.getElementById("quizQuestionBuilder");
  if (canManage && builder && builder.children.length === 0) {
    addQuizQuestion();
  }
}
// Add and remove question fields
document.getElementById("addQuizQuestion")?.addEventListener(
  "click",
  addQuizQuestion
);

document.getElementById("quizQuestionBuilder")?.addEventListener(
  "click",
  event => {
    if (event.target.classList.contains("remove-quiz-question")) {
      event.target.closest(".quiz-question-item")?.remove();

      document.querySelectorAll(".quiz-question-item h3").forEach((heading, index) => {
        heading.textContent = `Question ${index + 1}`;
      });
    }
  }
);

// Save a new quiz and its questions
document.getElementById("quizForm")?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const message = document.getElementById("quizFormMessage");
    const submitButton = form.querySelector('button[type="submit"]');

    const title = document.getElementById("quizTitle").value.trim();
    const subject = document.getElementById("quizSubject").value.trim();
    const description = document.getElementById("quizDescription").value.trim();

    const questionItems = [
      ...document.querySelectorAll(".quiz-question-item")
    ];

    if (!questionItems.length) {
      message.textContent = "Please add at least one question.";
      return;
    }

    const questions = [];

    for (const item of questionItems) {
      const questionText = item.querySelector(".quiz-question-text").value.trim();
      const options = [...item.querySelectorAll(".quiz-option")]
        .map(input => input.value.trim());
      const correctIndex = Number(
        item.querySelector(".quiz-correct-answer").value
      );

      if (!questionText || options.some(option => !option)) {
        message.textContent = "Please complete every question and answer option.";
        return;
      }

      questions.push({
        question_text: questionText,
        options,
        correct_option_index: correctIndex
      });
    }

    submitButton.disabled = true;
    message.textContent = "Saving your quiz...";

    try {
      const { data: authData } = await supabaseClient.auth.getUser();
      const user = authData?.user;

      if (!user) {
        message.textContent = "Please sign in first.";
        return;
      }

      const { data: quiz, error: quizError } = await supabaseClient
        .from("quizzes")
        .insert({
          created_by: user.id,
          title,
          subject,
          description,
          is_published: true
        })
        .select()
        .single();

      if (quizError) throw quizError;

      const questionRows = questions.map(question => ({
        quiz_id: quiz.id,
        question_text: question.question_text,
        options: question.options,
        correct_option_index: question.correct_option_index
      }));

      const { error: questionsError } = await supabaseClient
        .from("quiz_questions")
        .insert(questionRows);

      if (questionsError) {
        await supabaseClient
          .from("quizzes")
          .delete()
          .eq("id", quiz.id);

        throw questionsError;
      }

      form.reset();
      document.getElementById("quizQuestionBuilder").innerHTML = "";
      addQuizQuestion();

      message.textContent = "Quiz created and published successfully!";
      await loadQuizzes();

    } catch (error) {
      console.error("StudyFlow quiz creation error:", error);
      message.textContent = "Could not save quiz: " + error.message;
    } finally {
      submitButton.disabled = false;
    }
  }
);

// Load quizzes when the Quiz page is opened
// ===============================
// STUDENT TAKE QUIZ
// ===============================

async function takeQuiz(quizId) {
  const panel = document.getElementById("takeQuizPanel");
  const content = document.getElementById("takeQuizContent");

  panel.hidden = false;
  content.innerHTML = "<p>Loading quiz questions...</p>";
  panel.scrollIntoView({ behavior: "smooth" });

  try {
    const { data: questions, error } = await supabaseClient.rpc(
      "get_quiz_questions",
      { p_quiz_id: quizId }
    );

    if (error) throw error;

    if (!questions || questions.length === 0) {
      content.textContent = "No questions are available for this quiz.";
      return;
    }

    content.innerHTML = `
      <h2>Take Quiz</h2>
      <form id="studentQuizForm">
        ${questions.map((q, index) => `
          <div class="panel" style="margin-top:15px;">
            <h3>Question ${index + 1}</h3>
            <p>${escapeHtml(q.question_text)}</p>

            ${q.options.map((option, optionIndex) => `
              <label style="display:block; margin:10px 0;">
                <input
                  type="radio"
                  name="question_${index}"
                  value="${optionIndex}"
                  required
                >
                ${escapeHtml(option)}
              </label>
            `).join("")}
          </div>
        `).join("")}

        <button type="submit" class="primary-btn">
          Submit Answers
        </button>
      </form>
      <p id="quizSubmitMessage" class="muted"></p>
    `;

    document.getElementById("studentQuizForm").addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const answers = {};

        questions.forEach((question, index) => {
          const selected = document.querySelector(
            `input[name="question_${index}"]:checked`
          );

          answers[question.id] = Number(selected.value);
        });

        const submitButton = event.currentTarget.querySelector(
          'button[type="submit"]'
        );

        submitButton.disabled = true;
        document.getElementById("quizSubmitMessage").textContent =
          "Marking your answers...";

        try {
          const { data: result, error: submitError } =
            await supabaseClient.rpc("submit_quiz_attempt", {
              p_quiz_id: quizId,
              p_answers: answers
            });

          if (submitError) throw submitError;

          showQuizResult(result);
          await loadQuizResults();

        } catch (error) {
          document.getElementById("quizSubmitMessage").textContent =
            "Could not submit quiz: " + error.message;
          submitButton.disabled = false;
        }
      }
    );

  } catch (error) {
    content.textContent = "Could not load quiz: " + error.message;
  }
}

// Display score and correct answers
function showQuizResult(result) {
  const content = document.getElementById("takeQuizContent");

  const percentage = result.total_questions
    ? Math.round((result.score / result.total_questions) * 100)
    : 0;

  content.innerHTML = `
    <h2>Quiz Results</h2>
    <h3>Your Score: ${result.score} / ${result.total_questions}</h3>
    <p>Percentage: ${percentage}%</p>

    ${result.results.map((item, index) => `
      <div class="panel" style="margin-top:12px;">
        <h3>Question ${index + 1}</h3>
        <p>${escapeHtml(item.question_text)}</p>
        <p>Your answer: ${escapeHtml(
          item.options[item.selected_index] ?? "Not answered"
        )}</p>
        <p>Correct answer: <strong>${escapeHtml(
          item.options[item.correct_index]
        )}</strong></p>
        <p>${item.is_correct ? "Correct!" : "Incorrect"}</p>
      </div>
    `).join("")}
  `;
}

// Connect Take Quiz buttons
// Edit quiz title, subject and description
document.getElementById("quizzesList")?.addEventListener(
  "click",
  async event => {
    const button = event.target.closest(".edit-quiz-button");
    if (!button) return;

    const quizId = button.dataset.quizId;
    button.disabled = true;

    try {
      const { data: quiz, error: fetchError } = await supabaseClient
        .from("quizzes")
        .select("title, subject, description")
        .eq("id", quizId)
        .single();

      if (fetchError) throw fetchError;

      const title = window.prompt("Quiz title:", quiz.title);
      if (title === null) return;

      const subject = window.prompt("Quiz subject:", quiz.subject);
      if (subject === null) return;

      const description = window.prompt(
        "Quiz description:",
        quiz.description || ""
      );
      if (description === null) return;

      const { error } = await supabaseClient.rpc(
        "update_managed_quiz_details",
        {
          p_quiz_id: quizId,
          p_title: title,
          p_subject: subject,
          p_description: description
        }
      );

      if (error) throw error;

      alert("Quiz details updated successfully!");
      await loadQuizzes();

    } catch (error) {
      console.error("Quiz update error:", error);
      alert("Could not update quiz: " + error.message);
    } finally {
      button.disabled = false;
    }
  }
);
document.getElementById("quizzesList")?.addEventListener(
  "click",
  event => {
    const button = event.target.closest(".take-quiz-button");
    if (!button) return;

    takeQuiz(button.dataset.quizId);
  }
);

// Edit quiz questions
document.getElementById("quizzesList")?.addEventListener(
  "click",
  async event => {
    const button = event.target.closest(".edit-quiz-questions-button");
    if (!button) return;

    const quizId = button.dataset.quizId;
    button.disabled = true;

    try {
      const { data: attempts, error: attemptsError } = await supabaseClient
        .from("quiz_attempts")
        .select("id")
        .eq("quiz_id", quizId)
        .limit(1);

      if (attemptsError) throw attemptsError;

      if (attempts && attempts.length > 0) {
        alert("Questions are locked because a student has already attempted this quiz. Existing results are protected.");
        return;
      }

      const { data: existingQuestions, error: questionsError } =
        await supabaseClient
          .from("quiz_questions")
          .select("question_text, options, correct_option_index")
          .eq("quiz_id", quizId)
          .order("created_at", { ascending: true });

      if (questionsError) throw questionsError;

      const questions = [];

      for (let i = 0; i < existingQuestions.length; i++) {
        const current = existingQuestions[i];

        const questionText = window.prompt(
          `Question ${i + 1}:`,
          current.question_text
        );

        if (questionText === null) return;
        if (!questionText.trim()) {
          alert("Question text cannot be empty.");
          return;
        }

        const options = [];

        for (let j = 0; j < 4; j++) {
          const option = window.prompt(
            `Question ${i + 1} — Option ${j + 1}:`,
            current.options[j] || ""
          );

          if (option === null) return;
          if (!option.trim()) {
            alert("All four options must be filled in.");
            return;
          }

          options.push(option.trim());
        }

        const correctAnswer = window.prompt(
          `Question ${i + 1}: Enter the correct option number (1–4):`,
          String(current.correct_option_index + 1)
        );

        if (correctAnswer === null) return;

        const correctIndex = Number(correctAnswer) - 1;

        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
          alert("Please enter a number from 1 to 4.");
          return;
        }

        questions.push({
          question_text: questionText.trim(),
          options,
          correct_option_index: correctIndex
        });
      }

      const { error } = await supabaseClient.rpc(
        "update_managed_quiz_questions",
        {
          p_quiz_id: quizId,
          p_questions: questions
        }
      );

      if (error) throw error;

      alert("Quiz questions updated successfully!");
      await loadQuizzes();

    } catch (error) {
      console.error("Quiz question update error:", error);
      alert("Could not update questions: " + error.message);
    } finally {
      button.disabled = false;
    }
  }
);
// Load a student's previous quiz results
let currentQuizResultsPage = 1;
const quizResultsPerPage = 10;
async function loadQuizResults() {
  const list = document.getElementById("quizResultsList");
  if (!list) return;

  const { data: attempts, error } = await supabaseClient
    .from("quiz_attempts")
    .select("id, quiz_id, score, total_questions, submitted_at")
    .order("submitted_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load quiz results: " + error.message;
    return;
  }

  if (!attempts || attempts.length === 0) {
    list.innerHTML = "<p>No quiz attempts yet.</p>";
    return;
  }
  const totalQuizResultsPages = Math.max(
  1,
  Math.ceil(attempts.length / quizResultsPerPage)
);

if (currentQuizResultsPage > totalQuizResultsPages) {
  currentQuizResultsPage = totalQuizResultsPages;
}

const startIndex =
  (currentQuizResultsPage - 1) * quizResultsPerPage;

const paginatedAttempts = attempts.slice(
  startIndex,
  startIndex + quizResultsPerPage
);

  const quizIds = [...new Set(attempts.map(item => item.quiz_id))];

  const { data: quizzes } = await supabaseClient
    .from("quizzes")
    .select("id, title")
    .in("id", quizIds);

  const titles = {};
  (quizzes || []).forEach(quiz => {
    titles[quiz.id] = quiz.title;
  });

  list.innerHTML = paginatedAttempts.map(attempt => `
    <div class="panel" style="margin-top:10px;">
      <h3>${escapeHtml(titles[attempt.quiz_id] || "Quiz")}</h3>
      <p>Score: ${attempt.score} / ${attempt.total_questions}</p>
      <p>Date: ${new Date(attempt.submitted_at).toLocaleString()}</p>
    </div>
  `).join("");
  const quizResultsPrevious = document.getElementById("quizResultsPrevious");
const quizResultsNext = document.getElementById("quizResultsNext");
const quizResultsPageInfo = document.getElementById("quizResultsPageInfo");

if (quizResultsPageInfo) {
  quizResultsPageInfo.textContent =
    `Page ${currentQuizResultsPage} of ${totalQuizResultsPages}`;
}

if (quizResultsPrevious) {
  quizResultsPrevious.disabled = currentQuizResultsPage <= 1;
  quizResultsPrevious.onclick = async function () {
    if (currentQuizResultsPage > 1) {
      currentQuizResultsPage--;
      await loadQuizResults();
    }
  };
}

if (quizResultsNext) {
  quizResultsNext.disabled =
    currentQuizResultsPage >= totalQuizResultsPages;

  quizResultsNext.onclick = async function () {
    if (currentQuizResultsPage < totalQuizResultsPages) {
      currentQuizResultsPage++;
      await loadQuizResults();
    }
  };
}
}

// Load results for quizzes managed by the current admin or tutor
async function loadManagedQuizResults() {
  const list = document.getElementById("managedQuizResultsList");
  if (!list) return;

  list.innerHTML = "<p>Loading student results...</p>";

  const { data, error } = await supabaseClient.rpc("get_managed_quiz_results");

  if (error) {
    list.textContent = "Could not load student results: " + error.message;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No student quiz submissions yet.</p>";
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="panel" style="margin-top:10px;">
      <h3>${escapeHtml(item.student_name || "Student")}</h3>
      <p>Quiz: ${escapeHtml(item.quiz_title || "Quiz")}</p>
      <p>Score: ${item.score} / ${item.total_questions}</p>
      <p>Date: ${new Date(item.submitted_at).toLocaleString()}</p>
      <button
        type="button"
        class="review-quiz-attempt-button"
        data-attempt-id="${escapeHtml(item.attempt_id)}">
        Review answers
      </button>
    </div>
  `).join("");

  list.onclick = async (event) => {
    const button = event.target.closest(".review-quiz-attempt-button");
    if (!button) return;

    await loadManagedQuizAttemptDetails(button.dataset.attemptId);
  };
}

async function loadManagedQuizAttemptDetails(attemptId) {
  const details = document.getElementById("managedQuizAttemptDetails");
  if (!details) return;

  details.innerHTML = "<p>Loading quiz answers...</p>";

  const { data, error } = await supabaseClient.rpc(
    "get_managed_quiz_attempt_details",
    { p_attempt_id: attemptId }
  );

  if (error) {
    details.textContent = "Could not load quiz answers: " + error.message;
    return;
  }

  if (!data) {
    details.textContent = "No quiz details were found.";
    return;
  }

  const questionsHtml = (data.results || []).map((item, index) => {
    const options = Array.isArray(item.options) ? item.options : [];
    const selectedIndex = Number.isInteger(item.selected_index)
      ? item.selected_index
      : null;
    const correctIndex = item.correct_index;

    return `
      <div class="panel" style="margin-top:10px;">
        <h4>Question ${index + 1}: ${escapeHtml(item.question_text)}</h4>
        <p><strong>Student's answer:</strong>
          ${selectedIndex !== null && options[selectedIndex] !== undefined
            ? escapeHtml(options[selectedIndex])
            : "Not answered"}
        </p>
        <p><strong>Correct answer:</strong>
          ${options[correctIndex] !== undefined
            ? escapeHtml(options[correctIndex])
            : "Unavailable"}
        </p>
        <p><strong>Result:</strong>
          ${item.is_correct ? "Correct" : "Incorrect"}
        </p>
      </div>
    `;
  }).join("");

  details.innerHTML = `
    <h3>Answer Review</h3>
    <p><strong>Student:</strong> ${escapeHtml(data.student_name || "Student")}</p>
    <p><strong>Quiz:</strong> ${escapeHtml(data.quiz_title || "Quiz")}</p>
    <p><strong>Score:</strong> ${data.score} / ${data.total_questions}</p>
    ${questionsHtml}
  `;

  details.scrollIntoView({ behavior: "smooth", block: "start" });
}


/* ===== StudyFlow AI Chatbot Behaviour ===== */
(() => {
  const toggle = document.getElementById("studyflow-ai-toggle");
  const panel = document.getElementById("studyflow-ai-panel");
  const close = document.getElementById("studyflow-ai-close");
  const form = document.getElementById("studyflow-ai-form");
  const input = document.getElementById("studyflow-ai-input");
  const send = document.getElementById("studyflow-ai-send");
  const messagesBox = document.getElementById("studyflow-ai-messages");
  const supportToggle = document.getElementById("studyflow-support-toggle");
  const supportForm = document.getElementById("studyflow-support-form");

  if (!toggle || !panel || !form || !input || !messagesBox) return;

  const conversation = [];

  function addMessage(role, content) {
    const message = document.createElement("div");
    message.className = `sf-ai-message ${role}`;
    message.textContent = content;
    messagesBox.appendChild(message);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  toggle.addEventListener("click", () => {
    panel.hidden = false;
    input.focus();
  });

  if (close) {
    close.addEventListener("click", () => {
      panel.hidden = true;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = input.value.trim();
    if (!question || send?.disabled) return;

    addMessage("user", question);
    conversation.push({ role: "user", content: question });

    input.value = "";
    if (send) {
      send.disabled = true;
      send.textContent = "Thinking...";
    }

    const loading = document.createElement("div");
    loading.className = "sf-ai-message assistant";
    loading.textContent = "StudyFlow AI is thinking...";
    messagesBox.appendChild(loading);

    try {
      const reply = await askStudyFlowAI(conversation.slice(-12));

      loading.remove();
      addMessage("assistant", reply);
      conversation.push({ role: "assistant", content: reply });

      if (conversation.length > 12) {
        conversation.splice(0, conversation.length - 12);
      }
    } catch (error) {
      loading.remove();
      addMessage(
        "assistant",
        error.message || "Sorry, something went wrong. Please try again."
      );
    } finally {
      if (send) {
        send.disabled = false;
        send.textContent = "Send";
      }
      input.focus();
    }
  });

  if (supportToggle && supportForm) {
    supportToggle.addEventListener("click", () => {
      supportForm.hidden = !supportForm.hidden;
    });

    supportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const status = document.getElementById("studyflow-support-status");
      if (status) {
        status.textContent = "Student support submission is being configured. Please try again shortly.";
      }
    });
  }
})();



// ===== STUDYFLOW PAYSTACK PAYMENT RETURN =====
(async function handlePaystackReturn() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");

  if (!reference) return;

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();

    if (!sessionData?.session) {
      alert("Please sign in to the same StudyFlow account used for payment, then reload this page.");
      return;
    }

    // Check whether this is a Premium membership payment.
    if (reference.startsWith("studyflow_premium_")) {
      const { data, error } = await supabaseClient.functions.invoke(
        "Paystack-Payment",
        {
          body: {
            action: "verify_premium",
            reference: reference
          }
        }
      );

      if (error || !data?.success) {
        alert(
          data?.error ||
          data?.message ||
          error?.message ||
          "Premium payment verification failed. Please contact StudyFlow support."
        );
        return;
      }

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.hash
      );

      alert(
        "Congratulations! Your StudyFlow Premium membership is active."
      );

      window.location.reload();
      return;
    }

    // StudyFlow course payment verification.
if (reference.startsWith("studyflow_course_")) {
  const { data, error } = await supabaseClient.functions.invoke(
    "Paystack-Payment",
    {
      body: {
        action: "verify_course",
        reference: reference
      }
    }
  );

  if (error || !data?.success || !data?.course_id) {
    alert(
      data?.error ||
      data?.message ||
      error?.message ||
      "Course payment verification failed. Please contact StudyFlow support."
    );
    return;
  }

  localStorage.removeItem("studyflow.pendingCoursePurchase");

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + window.location.hash
  );

  alert("Payment successful! You are now enrolled in your course.");

  window.location.reload();
  return;
}
    // Existing study material and video payment verification.
    const { data, error } = await supabaseClient.functions.invoke(
      "Paystack-Payment",
      {
        body: {
          action: "verify",
          reference: reference
        }
      }
    );

    if (error || !data?.success || !data?.material_id) {
      alert(
        data?.error ||
        data?.message ||
        error?.message ||
        "Payment verification failed. Please contact StudyFlow support."
      );
      return;
    }

    const purchaseAction = localStorage.getItem(
      "studyflow.pendingPurchaseAction"
    );

    localStorage.removeItem("studyflow.pendingPurchaseAction");

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );

    alert("Payment successful! Your material is ready.");

    if (purchaseAction === "watch") {
      await watchStudyMaterial(data.material_id);
    } else {
      await downloadStudyMaterial(data.material_id);
    }
  } catch (error) {
    console.error("Paystack return error:", error);
    alert("Unable to verify your payment. Please try again.");
  }
})();


async function watchStudyMaterial(id) {
  try {
    const { data: authData } = await supabaseClient.auth.getUser();
    const user = authData?.user;

    if (!user) {
      alert("Please sign in first.");
      return;
    }

    const { data: material, error } = await supabaseClient
      .from("study_materials")
      .select("id, title, price, uploader_id")
      .eq("id", id)
      .single();

    if (error || !material) {
      alert("Study material not found.");
      return;
    }

    const { data: roles, error: rolesError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (rolesError) {
      alert("Could not check your account permissions.");
      return;
    }

    const isAdmin = roles?.some(item => item.role === "admin");
    const isUploader = material.uploader_id === user.id;
    const isFree = Number(material.price || 0) <= 0;

    let hasPaid = false;
    let hasPremium = false;

    if (!isFree && !isAdmin && !isUploader) {
      const { data: purchases, error: purchaseError } =
        await supabaseClient
          .from("material_purchases")
          .select("id")
          .eq("material_id", material.id)
          .eq("user_id", user.id)
          .eq("status", "success")
          .limit(1);

      if (purchaseError) {
        alert("Could not check your purchase. Please try again.");
        return;
      }

      hasPaid = purchases?.length > 0;

      const { data: memberships, error: membershipError } =
        await supabaseClient
          .from("premium_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .limit(1);

      if (membershipError) {
        alert("Could not check your Premium membership. Please try again.");
        return;
      }

      hasPremium = memberships?.length > 0;
    }

    if (
      !isFree &&
      !isAdmin &&
      !isUploader &&
      !hasPaid &&
      !hasPremium
    ) {
      const { data: paymentData, error: paymentError } =
        await supabaseClient.functions.invoke("Paystack-Payment", {
          body: {
            action: "initialize",
            materialId: material.id
          }
        });

      if (paymentError || !paymentData?.authorization_url) {
        alert(
          paymentData?.error ||
          paymentError?.message ||
          "Could not start payment. Please try again."
        );
        return;
      }

      localStorage.setItem(
        "studyflow.pendingPurchaseAction",
        "watch"
      );

      window.location.assign(paymentData.authorization_url);
      return;
    }

    const { data: video, error: videoError } = await supabaseClient
      .from("study_material_videos")
      .select("video_url")
      .eq("material_id", material.id)
      .single();

    if (videoError || !video?.video_url) {
      alert("Video not found or access denied.");
      return;
    }

    const videoLink = new URL(video.video_url);

    if (!["https:", "http:"].includes(videoLink.protocol)) {
      alert("This video link is not valid.");
      return;
    }

    window.open(videoLink.href, "_blank", "noopener,noreferrer");

  } catch (error) {
    console.error("StudyFlow video error:", error);
    alert("Unable to open the video. Please try again.");
  }
}

// Connect the Study Materials upload form
const materialUploadForm = document.getElementById("materialUploadForm");

if (materialUploadForm) {
  materialUploadForm.addEventListener("submit", uploadStudyMaterial);
}

// ===== STUDYFLOW PREMIUM MEMBERSHIP =====

async function subscribeToPremium(plan) {
  const message = document.getElementById(
    "premiumMembershipMessage"
  );

  try {
    const { data: authData } =
      await supabaseClient.auth.getUser();

    const user = authData?.user;

    if (!user) {
      alert("Please sign in before subscribing to StudyFlow Premium.");
      return;
    }

    if (!["monthly", "annual"].includes(plan)) {
      alert("Invalid Premium plan.");
      return;
    }

    if (message) {
      message.textContent = "Connecting to Paystack...";
    }

    const { data, error } =
      await supabaseClient.functions.invoke("Paystack-Payment", {
        body: {
          action: "initialize_premium",
          plan: plan
        }
      });

    if (error || !data?.success || !data?.authorization_url) {
      throw new Error(
        data?.error ||
        error?.message ||
        "Could not start Premium payment."
      );
    }

    window.location.assign(data.authorization_url);

  } catch (error) {
    console.error("StudyFlow Premium payment error:", error);

    if (message) {
      message.textContent =
        error.message || "Unable to start Premium payment.";
    } else {
      alert(error.message || "Unable to start Premium payment.");
    }
  }
}

// Display the signed-in user's Premium membership status.
async function loadPremiumMembershipStatus() {
  const statusBox = document.getElementById(
    "premiumMembershipStatus"
  );

  if (!statusBox) return;

  try {
    const { data: authData } =
      await supabaseClient.auth.getUser();

    if (!authData?.user) {
      statusBox.textContent = "Sign in to check your Premium membership.";
      return;
    }

    const { data: memberships, error } = await supabaseClient
      .from("premium_memberships")
      .select("plan, status, expires_at")
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (memberships?.length) {
      const membership = memberships[0];

      statusBox.textContent =
        `⭐ Your ${membership.plan} Premium membership is active until ` +
        new Date(membership.expires_at).toLocaleDateString();
    } else {
      statusBox.textContent =
        "You do not currently have an active Premium membership.";
    }

  } catch (error) {
    console.error("Premium membership status error:", error);
    statusBox.textContent =
      "Unable to load your Premium membership status.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPremiumMembershipStatus();
});
async function loadTutorPayoutRequests() {
  const list = document.getElementById("tutorPayoutRequestsList");

  if (!list) return;

  list.textContent = "Loading tutor payout requests...";

  try {
    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) {
      throw new Error("Please sign in first.");
    }

    const { data: roles, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (roleError) throw roleError;

    if (!roles?.some(item => item.role === "admin")) {
      list.textContent = "Administrator access required.";
      return;
    }

    const { data: requests, error } = await supabaseClient
      .from("tutor_payout_requests")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) throw error;

    if (!requests || requests.length === 0) {
      list.textContent = "No tutor payout requests have been submitted.";
      return;
    }

    const tutorIds = [...new Set(requests.map(r => r.tutor_id))];

    const { data: tutors, error: tutorError } = await supabaseClient
      .from("tutor_profiles")
      .select("id, display_name")
      .in("id", tutorIds);

    if (tutorError) throw tutorError;

    const tutorNames = Object.fromEntries(
      (tutors || []).map(t => [t.id, t.display_name])
    );

    const money = amount =>
      "₦" + Number(amount || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

    list.replaceChildren();

    requests.forEach(request => {
      const card = document.createElement("div");
      card.className = "panel";
      card.style.marginTop = "12px";

      const heading = document.createElement("h3");
      heading.textContent = tutorNames[request.tutor_id] || "Tutor";

      const amount = document.createElement("p");
      amount.textContent = "Requested amount: " + money(request.amount_ngn);

      const status = document.createElement("p");
      status.textContent = "Status: " + request.status;
      status.textContent = "Status: " + request.status;
      const bankButton = document.createElement("button");
      bankButton.type = "button";
      bankButton.className = "secondary-btn";
      bankButton.textContent = "View Bank Details";

      bankButton.addEventListener("click", async () => {
        bankButton.disabled = true;
        bankButton.textContent = "Loading...";

        try {
          const { data, error } = await supabaseClient.rpc(
            "admin_get_tutor_payout_bank_details",
            { p_request_id: request.id }
          );

          if (error) throw error;

          const details = Array.isArray(data) ? data[0] : data;

          if (!details) {
            throw new Error("No bank details were returned.");
          }

          alert(
            "Bank: " + details.bank_name +
            "\nAccount name: " + details.account_name +
            "\nAccount number: " + details.account_number
          );
        } catch (error) {
          alert("Could not load bank details: " + error.message);
        } finally {
          bankButton.disabled = false;
          bankButton.textContent = "View Bank Details";
        }
      });

      const date = document.createElement("p");
      date.textContent =
        "Requested: " + new Date(request.requested_at).toLocaleString("en-NG");

      const reference = document.createElement("p");
      reference.textContent = request.payout_reference
        ? "Transfer reference: " + request.payout_reference
        : "";

      const note = document.createElement("p");
      note.textContent = request.admin_note
        ? "Admin note: " + request.admin_note
        : "";

      card.append(heading, amount, status, date);

      if (["Pending", "Approved"].includes(request.status)) {
        card.appendChild(bankButton);
      }

      if (reference.textContent) card.appendChild(reference);
      if (note.textContent) card.appendChild(note);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";
      actions.style.flexWrap = "wrap";

      function addAction(label, action, className = "primary-btn") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;

        button.addEventListener("click", async () => {
          let payoutReference = null;
          let adminNote = null;

          if (action === "reject") {
            adminNote = prompt("Enter the reason for rejecting this request:");

            if (adminNote === null) return;
          }

          if (action === "approve") {
            adminNote = prompt("Optional note for this approval:") || null;

            if (!confirm("Approve this tutor payout request?")) return;
          }

          if (action === "paid") {
            payoutReference = prompt(
              "Enter the bank transfer reference from the completed transfer:"
            );

            if (payoutReference === null) return;

            if (!payoutReference.trim()) {
              alert("A transfer reference is required.");
              return;
            }

            if (!confirm(
              "Have you already transferred this amount to the tutor's bank account?"
            )) return;
          }

          button.disabled = true;
          button.textContent = "Processing...";

          const { error: processError } = await supabaseClient.rpc(
            "admin_process_tutor_payout_request",
            {
              p_request_id: request.id,
              p_action: action,
              p_payout_reference: payoutReference,
              p_admin_note: adminNote
            }
          );

          if (processError) {
            alert("Payout action failed: " + processError.message);
            button.disabled = false;
            button.textContent = label;
            return;
          }

          alert("Payout request updated successfully.");
          await loadTutorPayoutRequests();
        });

        actions.appendChild(button);
      }

      if (request.status === "Pending") {
        addAction("Approve", "approve");
        addAction("Reject", "reject", "secondary-btn");
      }

      if (request.status === "Approved") {
        addAction("Reject", "reject", "secondary-btn");
        addAction("Mark as Paid", "paid");
      }

      if (actions.children.length > 0) {
        card.appendChild(actions);
      }

      list.appendChild(card);
    });

  } catch (error) {
    list.textContent = "Unable to load payout requests: " + error.message;
    console.error("Tutor payout requests error:", error);
  }
}

const refreshPayoutReportsButton =
  document.getElementById("refreshPayoutReports");

if (refreshPayoutReportsButton) {
  const reportsMessage =
    document.getElementById("payoutReportsMessage");

  const formatReportAmount = (amount) =>
    "₦" + Number(amount || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  async function loadAdminPayoutReports() {
    refreshPayoutReportsButton.disabled = true;
    reportsMessage.textContent = "Loading payout reports...";

    try {
      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Please log in as an administrator.");
      }

      const { data, error } = await supabaseClient.rpc(
        "admin_get_payout_report"
      );

      if (error) throw error;

      const report = Array.isArray(data) ? data[0] : data;

      if (!report) {
        throw new Error("No report data was returned.");
      }

      document.getElementById("reportTutoringPayments").textContent =
        formatReportAmount(report.tutoring_payments_total);

      document.getElementById("reportMaterialSales").textContent =
        formatReportAmount(report.material_sales_total);

      document.getElementById("reportTotalCommission").textContent =
        formatReportAmount(report.studyflow_commissions_total);

      document.getElementById("reportTutorEarnings").textContent =
        formatReportAmount(report.tutor_earnings_total);

      document.getElementById("reportTotalPaid").textContent =
        formatReportAmount(report.total_payouts_paid);

      document.getElementById("reportOutstanding").textContent =
        formatReportAmount(report.outstanding_tutor_earnings);

      reportsMessage.textContent = "Payout reports updated successfully.";
    } catch (error) {
      console.error("Payout reports error:", error);
      reportsMessage.textContent =
        "Could not load reports: " + error.message;
    } finally {
      refreshPayoutReportsButton.disabled = false;
    }
  }

  refreshPayoutReportsButton.addEventListener(
    "click",
    loadAdminPayoutReports
  );

  loadAdminPayoutReports();
}
const downloadPayoutReportButton =
  document.getElementById("downloadPayoutReport");

if (downloadPayoutReportButton) {
  downloadPayoutReportButton.addEventListener("click", async () => {
    downloadPayoutReportButton.disabled = true;

    try {
      const { data, error } = await supabaseClient.rpc(
        "admin_get_payout_report"
      );

      if (error) throw error;

      const report = Array.isArray(data) ? data[0] : data;

      if (!report) {
        throw new Error("No financial report data was returned.");
      }

      const rows = [
        ["StudyFlow Financial Report"],
        ["Generated", new Date().toLocaleString("en-NG")],
        [],
        ["Financial Category", "Amount (NGN)"],
        ["Total Tutoring Payments", report.tutoring_payments_total],
        ["Total Material Sales", report.material_sales_total],
        ["StudyFlow Commissions", report.studyflow_commissions_total],
        ["Total Tutor Earnings", report.tutor_earnings_total],
        ["Total Payouts Paid", report.total_payouts_paid],
        ["Outstanding Tutor Earnings", report.outstanding_tutor_earnings]
      ];

      const csv = rows.map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
      ).join("\r\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
      });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = "StudyFlow-Financial-Report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(downloadUrl);

      alert("Financial report downloaded successfully!");
    } catch (error) {
      console.error("Financial report download error:", error);
      alert("Could not download report: " + error.message);
    } finally {
      downloadPayoutReportButton.disabled = false;
    }
  });
}
const downloadDetailedTransactionsButton =
  document.getElementById("downloadDetailedTransactions");

if (downloadDetailedTransactionsButton) {
  downloadDetailedTransactionsButton.addEventListener("click", async () => {
    downloadDetailedTransactionsButton.disabled = true;

    try {
      const { data, error } = await supabaseClient.rpc(
        "admin_get_detailed_transactions"
      );

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("No transaction records were found.");
      }

      const headers = [
        "Transaction Type",
        "Transaction ID",
        "Transaction Date",
        "Tutor Name",
        "Description",
        "Student ID",
        "Amount (NGN)",
        "Commission (NGN)",
        "Tutor Earnings (NGN)",
        "Payment Reference",
        "Payment Status",
        "Payout Status",
        "Payout Reference",
        "Paid At",
        "Payment Mode"
      ];

      const rows = data.map(item => [
        item.transaction_type,
        item.transaction_id,
        item.transaction_date,
        item.tutor_name,
        item.description,
        item.student_id,
        item.amount_ngn,
        item.commission_ngn,
        item.tutor_earning_ngn,
        item.payment_reference,
        item.payment_status,
        item.payout_status,
        item.payout_reference,
        item.paid_at,
        item.payment_mode
      ]);

      const csv = [headers, ...rows]
        .map(row =>
          row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
          ).join(",")
        )
        .join("\r\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
      });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = "StudyFlow-Detailed-Transactions.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(downloadUrl);

      alert("Detailed transaction report downloaded successfully!");
    } catch (error) {
      console.error("Detailed transaction export error:", error);
      alert("Could not download transactions: " + error.message);
    } finally {
      downloadDetailedTransactionsButton.disabled = false;
    }
  });
}
window.shareStudyFlowTutoring = async function (platform) {
  const shareUrl = window.location.origin + window.location.pathname;
  const shareText =
    "Need extra academic support? Explore StudyFlow Tutoring Services and connect with tutors for personalized learning.";

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);

  if (platform === "whatsapp") {
    window.open(
      `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      "_blank"
    );
  } else if (platform === "facebook") {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      "_blank"
    );
  } else if (platform === "x") {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      "_blank"
    );
  } else if (platform === "copy") {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("StudyFlow Tutoring link copied successfully!");
    } catch (error) {
      alert("Unable to copy the link. Please copy the website address from your browser.");
    }
  }
};


const tutorMessageForm = document.getElementById("tutorMessageForm");

if (tutorMessageForm) {
  tutorMessageForm.addEventListener("submit", async event => {
    event.preventDefault();

    const input = document.getElementById("tutorMessageInput");
    const status = document.getElementById("tutorMessageStatus");
    const message = input.value.trim();

    if (!activeTutorConversationId || !message) {
      status.textContent = "Select a conversation and enter a message.";
      return;
    }

    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    const user = authData?.user;

    if (authError || !user) {
      status.textContent = "Please sign in again.";
      return;
    }

    status.textContent = "Sending message...";

    const { error } = await supabaseClient
      .from("tutor_messages")
      .insert({
        conversation_id: activeTutorConversationId,
        sender_id: user.id,
        message
      });

    if (error) {
      console.error("Message sending error:", error);
      status.textContent = "Message could not be sent. Please try again.";
      return;
    }

    input.value = "";
    status.textContent = "Message sent successfully.";

    await loadTutorMessages();
    await updateUnreadMessageCount();
  });
}


async function purchaseCourse(courseId) {
  try {
    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) {
      alert("Please sign in before purchasing this course.");
      return;
    }

    const { data: paymentData, error: paymentError } =
      await supabaseClient.functions.invoke("Paystack-Payment", {
        body: {
          action: "initialize_course",
          courseId
        }
      });

    if (paymentError || !paymentData?.authorization_url) {
      alert(
        paymentData?.error ||
        paymentError?.message ||
        "Could not start course payment. Please try again."
      );
      return;
    }

    localStorage.setItem(
      "studyflow.pendingCoursePurchase",
      paymentData.reference
    );

    window.location.assign(paymentData.authorization_url);

  } catch (error) {
    console.error("Course payment error:", error);
    alert("Something went wrong while starting course payment.");
  }
}

async function loadStudyCourses() {
  const catalogue = document.getElementById("courseCatalogue");

  if (!catalogue) return;

  catalogue.textContent = "Loading available courses...";

  const { data: courses, error } = await supabaseClient
    .from("courses")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    catalogue.textContent =
      "Could not load courses: " + error.message;
    return;
  }

  catalogue.replaceChildren();

  if (!courses || courses.length === 0) {
    catalogue.textContent = "No approved courses are available yet.";
    return;
  }

  courses.forEach(course => {
    const card = document.createElement("article");
    card.className = "panel";

    const title = document.createElement("h3");
    title.textContent = course.title;

    const description = document.createElement("p");
    description.textContent = course.description || "No description provided.";

    const category = document.createElement("p");
    category.textContent = "Category: " + (course.category || "General");

    const level = document.createElement("p");
    level.textContent = "Level: " + (course.level || "Not specified");

    const price = document.createElement("p");
    price.textContent = course.price_ngn === 0
      ? "Free course"
      : "Price: " + new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: "NGN",
          maximumFractionDigits: 0
        }).format(course.price_ngn);

    const enrollButton = document.createElement("button");
    enrollButton.type = "button";
    enrollButton.className = "primary-button";
    enrollButton.textContent = course.price_ngn === 0
      ? "Free Enrolment Coming Soon"
      : "Purchase Course";

   enrollButton.disabled = false;

    if (course.price_ngn > 0) {
      enrollButton.addEventListener("click", () => {
        purchaseCourse(course.id);
      });
    }

    else {
  enrollButton.textContent = "Enrol for Free";

  enrollButton.addEventListener("click", async () => {
    const { data: authData } = await supabaseClient.auth.getUser();

    if (!authData?.user) {
      alert("Please sign in before enrolling.");
      return;
    }

    enrollButton.disabled = true;
    enrollButton.textContent = "Enrolling...";

    const { error } = await supabaseClient.rpc(
      "enroll_free_course",
      { p_course_id: course.id }
    );

    if (error) {
      alert("Free enrolment failed: " + error.message);
      enrollButton.disabled = false;
      enrollButton.textContent = "Enrol for Free";
      return;
    }

    alert("You have successfully enrolled in this course!");

    enrollButton.textContent = "Enrolled";
    await loadStudyCourses();
  });
}

    card.append(title, description, category, level, price, enrollButton);
    catalogue.append(card);
  });
}

const courseCreateForm = document.getElementById("courseCreateForm");

if (courseCreateForm) {
  courseCreateForm.addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.getElementById("courseCreateMessage");
    const submitButton = courseCreateForm.querySelector('button[type="submit"]');

    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) {
      message.textContent = "Please sign in before creating a course.";
      return;
    }

    const { data: roles, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (roleError || !roles?.some(item =>
      ["admin", "tutor"].includes(item.role)
    )) {
      message.textContent = "Only admins and registered tutors can create courses.";
      return;
    }

    const title = document.getElementById("courseTitle").value.trim();
    const description = document.getElementById("courseDescription").value.trim();
    const category = document.getElementById("courseCategory").value.trim();
    const level = document.getElementById("courseLevel").value;
    const price = Number(document.getElementById("coursePrice").value);

    if (!title || !description || !category || !level ||
        !Number.isInteger(price) || price < 0) {
      message.textContent = "Please complete all course fields correctly.";
      return;
    }

    submitButton.disabled = true;
    message.textContent = "Submitting course for approval...";

    const { error } = await supabaseClient
      .from("courses")
      .insert({
        creator_id: authData.user.id,
        title,
        description,
        category,
        level,
        price_ngn: price,
        status: "pending_approval"
      });

    submitButton.disabled = false;

    if (error) {
      console.error("Course creation error:", error);
      message.textContent = "Course submission failed: " + error.message;
      return;
    }

    courseCreateForm.reset();
    message.textContent =
      "Course submitted successfully. An administrator must approve it before students can enrol.";

    await loadStudyCourses();
  });
}

async function loadAdminCourses() {
  const list = document.getElementById("courseAdminList");

  if (!list) return;

  list.textContent = "Loading courses awaiting approval...";

  const { data: courses, error } = await supabaseClient
    .from("courses")
    .select("*")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });

  if (error) {
    list.textContent = "Could not load courses: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!courses || courses.length === 0) {
    list.textContent = "There are no courses awaiting approval.";
    return;
  }

  courses.forEach(course => {
    const card = document.createElement("article");
    card.className = "panel";

    const title = document.createElement("h3");
    title.textContent = course.title;

    const description = document.createElement("p");
    description.textContent = course.description;

    const details = document.createElement("p");
    details.textContent =
      "Category: " + course.category +
      " | Level: " + course.level +
      " | Price: " +
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0
      }).format(course.price_ngn);

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.textContent = "Approve Course";
    approveButton.className = "primary-button";

    approveButton.addEventListener("click", async () => {
      if (!confirm("Approve this course and make it available to students?")) {
        return;
      }

      approveButton.disabled = true;

      const { data: authData } = await supabaseClient.auth.getUser();

      const { error: updateError } = await supabaseClient
        .from("courses")
        .update({
          status: "approved",
          approved_by: authData.user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null
        })
        .eq("id", course.id);

      if (updateError) {
        alert("Could not approve course: " + updateError.message);
        approveButton.disabled = false;
        return;
      }

      alert("Course approved successfully.");
      await loadAdminCourses();
      await loadStudyCourses();
    });

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.textContent = "Reject Course";
    rejectButton.className = "secondary-button";

    rejectButton.addEventListener("click", async () => {
      const reason = prompt("Enter the reason for rejecting this course:");

      if (reason === null) return;

      if (!reason.trim()) {
        alert("Please provide a rejection reason.");
        return;
      }

      rejectButton.disabled = true;

      const { error: updateError } = await supabaseClient
        .from("courses")
        .update({
          status: "rejected",
          rejection_reason: reason.trim()
        })
        .eq("id", course.id);

      if (updateError) {
        alert("Could not reject course: " + updateError.message);
        rejectButton.disabled = false;
        return;
      }

      alert("Course rejected.");
      await loadAdminCourses();
    });

    card.append(
      title,
      description,
      details,
      approveButton,
      rejectButton
    );

    list.append(card);
  });
}

async function loadMyCourses() {
  const list = document.getElementById("myCoursesList");

  if (!list) return;

  list.textContent = "Loading your courses...";

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData?.user) {
    list.textContent = "Please sign in to view your courses.";
    return;
  }

  const { data: enrollments, error } = await supabaseClient
    .from("course_enrollments")
    .select(`
      id,
      course_id,
      amount_paid_ngn,
      paid_at,
      courses (
        id,
        title,
        description,
        category,
        level
      )
    `)
    .eq("student_id", authData.user.id)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load your courses: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!enrollments || enrollments.length === 0) {
    list.textContent = "You have not enrolled in any courses yet.";
    return;
  }

  enrollments.forEach(enrollment => {
    const course = enrollment.courses;

    if (!course) return;

    const card = document.createElement("article");
    card.className = "panel";

    const title = document.createElement("h3");
    title.textContent = course.title;

    const description = document.createElement("p");
    description.textContent =
      course.description || "No course description provided.";

    const details = document.createElement("p");
    details.textContent =
      "Category: " + (course.category || "General") +
      " | Level: " + (course.level || "Not specified");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "primary-button";
    openButton.textContent = "Open Course";

    openButton.addEventListener("click", () => {
      openStudyCourse(course.id);
    });

    card.append(title, description, details, openButton);
    list.append(card);
  });
}

async function openStudyCourse(courseId) {
  const panel = document.getElementById("courseContentPanel");
  const modulesList = document.getElementById("courseModulesList");

  if (!panel || !modulesList) return;

  panel.hidden = false;
  modulesList.textContent = "Loading course content...";

  const { data: authData } = await supabaseClient.auth.getUser();

  if (!authData?.user) {
    modulesList.textContent = "Please sign in to access this course.";
    return;
  }

  const { data: course, error: courseError } = await supabaseClient
    .from("courses")
    .select("id, title, description")
    .eq("id", courseId)
    .single();

  if (courseError || !course) {
    modulesList.textContent = "Could not load this course.";
    return;
  }

  document.getElementById("courseContentTitle").textContent =
    course.title;

  document.getElementById("courseContentDescription").textContent =
    course.description || "";

  const { data: modules, error } = await supabaseClient
    .from("course_modules")
    .select(`
      id,
      title,
      description,
      position,
      course_lessons (
        id,
        title,
        description,
        lesson_type,
        content,
        video_url,
        material_url,
        is_preview,
        position
      )
    `)
    .eq("course_id", courseId)
    .order("position", { ascending: true });

  if (error) {
    modulesList.textContent =
      "Could not load course modules: " + error.message;
    return;
  }

  const { data: lessonProgress, error: progressError } =
  await supabaseClient
    .from("course_lesson_progress")
    .select("lesson_id, is_completed")
    .eq("student_id", authData.user.id);

if (progressError) {
  modulesList.textContent =
    "Could not load lesson progress: " + progressError.message;
  return;
}

const completedLessonIds = new Set(
  (lessonProgress || [])
    .filter(item => item.is_completed)
    .map(item => item.lesson_id)
);

  modulesList.replaceChildren();

  if (!modules || modules.length === 0) {
    modulesList.textContent =
      "No modules have been added to this course yet.";
    return;
  }

  modules.forEach(module => {
    const moduleCard = document.createElement("article");
    moduleCard.className = "panel";

    const heading = document.createElement("h3");
    heading.textContent = module.title;

    const description = document.createElement("p");
    description.textContent = module.description || "";

    moduleCard.append(heading, description);

    const lessons = module.course_lessons || [];

    lessons.sort((a, b) => a.position - b.position);

    lessons.forEach(lesson => {
      const lessonCard = document.createElement("div");
      lessonCard.className = "panel";

      const lessonTitle = document.createElement("h4");
      lessonTitle.textContent = lesson.title;

      const lessonDescription = document.createElement("p");
      lessonDescription.textContent = lesson.description || "";

      lessonCard.append(lessonTitle, lessonDescription);

      if (lesson.content) {
        const content = document.createElement("p");
        content.textContent = lesson.content;
        lessonCard.append(content);
      }

      if (lesson.video_url) {
        const videoLink = document.createElement("a");
        videoLink.href = lesson.video_url;
        videoLink.target = "_blank";
        videoLink.rel = "noopener noreferrer";
        videoLink.textContent = "Watch Lesson Video";
        lessonCard.append(videoLink);
      }

      if (lesson.material_url) {
        const materialLink = document.createElement("a");
        materialLink.href = lesson.material_url;
        materialLink.target = "_blank";
        materialLink.rel = "noopener noreferrer";
        materialLink.textContent = "Open Lesson Material";
        lessonCard.append(materialLink);
      }

      const completeButton = document.createElement("button");
completeButton.type = "button";
completeButton.className = "primary-button";

const alreadyCompleted = completedLessonIds.has(lesson.id);

completeButton.textContent = alreadyCompleted
  ? "Completed ✓"
  : "Mark as Completed";

completeButton.disabled = alreadyCompleted;

completeButton.addEventListener("click", async () => {
  completeButton.disabled = true;
  completeButton.textContent = "Saving...";

  const { error: saveError } = await supabaseClient
    .from("course_lesson_progress")
    .upsert(
      {
        lesson_id: lesson.id,
        student_id: authData.user.id,
        is_completed: true,
        completed_at: new Date().toISOString()
      },
      {
        onConflict: "lesson_id,student_id"
      }
    );

  if (saveError) {
    alert("Could not save lesson progress: " + saveError.message);
    completeButton.disabled = false;
    completeButton.textContent = "Mark as Completed";
    return;
  }

  completedLessonIds.add(lesson.id);
  completeButton.textContent = "Completed ✓";
  alert("Lesson marked as completed!");
});

lessonCard.append(completeButton);
      moduleCard.append(lessonCard);
    });

    modulesList.append(moduleCard);
  });
  const totalLessons = modules.reduce(
  (total, module) =>
    total + (module.course_lessons || []).length,
  0
);

const completedCount = modules.reduce(
  (total, module) =>
    total + (module.course_lessons || []).filter(
      lesson => completedLessonIds.has(lesson.id)
    ).length,
  0
);

if (totalLessons > 0 && completedCount === totalLessons) {
  const certificateButton = document.createElement("button");
  certificateButton.type = "button";
  certificateButton.className = "primary-button";
  certificateButton.textContent = "Get My Course Certificate";

  certificateButton.addEventListener("click", async () => {
    certificateButton.disabled = true;
    certificateButton.textContent = "Issuing Certificate...";

    const { data, error } = await supabaseClient.rpc(
      "issue_course_certificate",
      { p_course_id: courseId }
    );

    if (error) {
      alert("Certificate issuance failed: " + error.message);
      certificateButton.disabled = false;
      certificateButton.textContent = "Get My Course Certificate";
      return;
    }

    alert(
      "Congratulations! Your course certificate has been issued." +
      (data?.certificate_number
        ? "\nCertificate number: " + data.certificate_number
        : "")
    );

    certificateButton.textContent = "Certificate Issued ✓";
  });

  modulesList.append(certificateButton);
}
}

const closeCourseContentButton =
  document.getElementById("closeCourseContent");

if (closeCourseContentButton) {
  closeCourseContentButton.addEventListener("click", () => {
    document.getElementById("courseContentPanel").hidden = true;
  });
}

async function loadMyCourseCertificates() {
  const list = document.getElementById("myCourseCertificates");

  if (!list) return;

  list.textContent = "Loading your certificates...";

  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !authData?.user) {
    list.textContent = "Please sign in to view your certificates.";
    return;
  }

  const { data: certificates, error } = await supabaseClient
    .from("course_certificates")
    .select(`
      id,
      certificate_number,
      issued_at,
      courses (
        title
      )
    `)
    .eq("student_id", authData.user.id)
    .order("issued_at", { ascending: false });

  if (error) {
    list.textContent =
      "Could not load certificates: " + error.message;
    return;
  }

  list.replaceChildren();

  if (!certificates || certificates.length === 0) {
    list.textContent = "You have not earned any course certificates yet.";
    return;
  }

  certificates.forEach(certificate => {
    const card = document.createElement("article");
    card.className = "panel";

    const title = document.createElement("h3");
    title.textContent =
      certificate.courses?.title || "StudyFlow Course Certificate";

    const number = document.createElement("p");
    number.textContent =
      "Certificate number: " + certificate.certificate_number;

    const date = document.createElement("p");
    date.textContent =
      "Issued: " +
      new Date(certificate.issued_at).toLocaleDateString("en-NG");

    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.className = "primary-button";
    printButton.textContent = "Print Certificate";

    printButton.addEventListener("click", () => {
      const printWindow = window.open("", "_blank");

      if (!printWindow) {
        alert("Please allow pop-ups to print your certificate.");
        return;
      }

      const certificateHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>StudyFlow Certificate</title>
          <style>
            body {
              font-family: Georgia, serif;
              text-align: center;
              padding: 60px 30px;
              color: #1e293b;
            }
            .certificate {
              border: 10px double #2563eb;
              padding: 55px 30px;
              max-width: 850px;
              margin: auto;
            }
            h1 { font-size: 38px; color: #1d4ed8; }
            h2 { font-size: 28px; }
            .number { margin-top: 35px; font-size: 14px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="certificate">
            <h1>StudyFlow</h1>
            <h2>Certificate of Completion</h2>
            <p>This certifies that</p>
            <h2>${escapeCertificateText(authData.user.email || "Student")}</h2>
            <p>has successfully completed the course</p>
            <h2>${escapeCertificateText(certificate.courses?.title || "StudyFlow Course")}</h2>
            <p>Issued on ${new Date(certificate.issued_at).toLocaleDateString("en-NG")}</p>
            <p class="number">Certificate Number: ${escapeCertificateText(certificate.certificate_number)}</p>
            <p>StudyFlow Learning Platform</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          <\/script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(certificateHtml);
      printWindow.document.close();
    });

    card.append(title, number, date, printButton);
    list.append(card);
  });
}

function escapeCertificateText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
