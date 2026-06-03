// main.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ---------------- Supabase Setup ----------------
const SUPABASE_URL = "https://yhquakaqetinuhocgpbk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlocXVha2FxZXRpbnVob2NncGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Njg5NzMsImV4cCI6MjA3ODQ0NDk3M30.izneiZAJEq2_VY_q_84roaEgGuXewQn8dlakVXorUD4"; // <-- replace if needed

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const hasSupabaseConfig = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// ---------------- Helpers ----------------
const el = (id) => document.getElementById(id);
const show = (id, on = true) => {
  const node = el(id);
  if (!node) return;
  node.classList.toggle("hidden", !on);
};
const setText = (id, text) => {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
};

// ---------------- State ----------------
let authedEmail = "";
let role = null;
let authSignUp = false;
let signingOut = false;

// ---------------- Init App ----------------
async function init() {
  if (!hasSupabaseConfig) {
    console.warn("Supabase config missing");
    show("supabase-missing", true);
    show("auth-card", false);
    return;
  }

  // initial state
  await updateUserState();

  // Auth state change
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (signingOut) return; // ignore during sign-out process
    await updateUserState();
  });

  bindAuth();
  bindStudent();
  bindAdmin();
  bindRoleSelect();

  authSignUp = location.hash === "#signup";
  updateAuthView();

  window.addEventListener("hashchange", () => {
    authSignUp = location.hash === "#signup";
    updateAuthView();
  });

  renderMain();
}

// ---------------- Update User State ----------------
async function updateUserState() {
  try {
    const sessionRes = await supabase.auth.getSession();
    authedEmail = sessionRes.data.session?.user?.email ?? "";

    if (sessionRes.data.session?.user?.id) {
      const userId = sessionRes.data.session.user.id;
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 sometimes appears if row not found — ignore that gracefully
        console.warn("Could not fetch user role:", error.message);
      }

      role = data?.role ?? null;
    } else {
      role = null;
    }
  } catch (err) {
    console.error("updateUserState error:", err);
    role = null;
    authedEmail = "";
  }

  updateHeader();
  renderMain();
}

// ---------------- Header ----------------
function updateHeader() {
  setText("user-email", authedEmail || "");
  const ue = el("user-email");
  const so = el("sign-out");
  if (ue) ue.classList.toggle("hidden", !authedEmail);
  if (so) so.classList.toggle("hidden", !authedEmail);
}

// ---------------- Render Main ----------------
function renderMain() {
  const isAuthed = !!authedEmail;
  show("auth-card", !isAuthed);
  show("select-role", isAuthed && !role);
  show("student-dashboard", isAuthed && role === "student");
  show("admin-dashboard", isAuthed && role === "admin");
}

// ---------------- Auth Binding ----------------
function bindAuth() {
  const toggleBtn = el("toggle-auth");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      authSignUp = !authSignUp;
      location.hash = authSignUp ? "#signup" : "#signin";
      updateAuthView();
      const errBox = el("auth-error");
      if (errBox) errBox.classList.add("hidden");
    });
  }

  const authForm = el("auth-form");
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = el("auth-error");
      if (errBox) errBox.classList.add("hidden");

      const email = el("auth-email")?.value.trim() ?? "";
      const password = el("auth-password")?.value ?? "";

      try {
        if (authSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: {} },
          });
          if (error) throw error;

          // insert into users table (role default student)
          const { error: tableError } = await supabase.from("users").insert([
            { id: data.user.id, email: data.user.email, role: "student" },
          ]);
          if (tableError) console.warn("Could not insert into users table:", tableError.message);
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }

        await updateUserState();
      } catch (err) {
        console.error("Auth error:", err);
        if (errBox) {
          errBox.textContent = err.message || "Authentication error";
          errBox.classList.remove("hidden");
        } else {
          alert(err.message || "Authentication error");
        }
      }
    });
  }

  // ---------------- Sign-out ----------------
  const signOutBtn = el("sign-out");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      try {
        signingOut = true;
        await supabase.auth.signOut();
        authedEmail = "";
        role = null;
        updateHeader();
        renderMain();
      } catch (err) {
        console.error("Sign out failed:", err);
      } finally {
        signingOut = false;
      }
    });
  }
}

// ---------------- Auth View ----------------
function updateAuthView() {
  const title = el("auth-title");
  const submitBtn = el("auth-submit");
  if (title) title.textContent = authSignUp ? "Create account" : "Sign in";
  if (submitBtn) submitBtn.textContent = authSignUp ? "Sign up" : "Sign in";
}

// ---------------- Role Selection ----------------
function bindRoleSelect() {
  const container = el("select-role");
  if (!container) return;
  container.querySelectorAll("button[data-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = btn.dataset.role;
      try {
        const session = await supabase.auth.getSession();
        const userId = session.data.session?.user?.id;
        if (!userId) return alert("Not signed in.");
        const { error } = await supabase.from("users").update({ role: r }).eq("id", userId);
        if (error) return alert(error.message);
        await updateUserState();
      } catch (err) {
        console.error("Role select error:", err);
      }
    });
  });
}

// ---------------- Student Leave Form ----------------
function bindStudent() {
  const form = el("leave-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        enrollment_number: el("f-enrollment")?.value.trim() ?? "",
        name: el("f-name")?.value.trim() ?? "",
        course: el("f-course")?.value.trim() ?? "",
        department: el("f-department")?.value.trim() ?? "",
        semester: el("f-semester")?.value.trim() ?? "",
        start_date: el("f-start")?.value ?? "",
        end_date: el("f-end")?.value ?? "",
        reason: el("f-reason")?.value.trim() ?? "",
        status: "Pending",
      };

      // Basic client-side validation (ensure enrollment present)
      if (!payload.enrollment_number) {
        return alert("Please enter enrollment number.");
      }

      try {
        const { error } = await supabase.from("leaves").insert(payload);
        if (error) throw error;

        // success UX
        alert("Leave application submitted successfully!");

        // store enrollment in user metadata (optional)
        try {
          await supabase.auth.updateUser({ data: { enrollment_number: payload.enrollment_number } });
        } catch (metaErr) {
          console.warn("Failed to update user metadata:", metaErr.message || metaErr);
        }

        // clear fields
        ["f-name", "f-course", "f-department", "f-semester", "f-start", "f-end", "f-reason"].forEach(id => {
          const node = el(id);
          if (node) node.value = "";
        });

        const myEnroll = el("my-enrollment");
        if (myEnroll) myEnroll.value = payload.enrollment_number;

        await loadMy(payload.enrollment_number);
      } catch (err) {
        console.error("Submit leave failed:", err);
        alert(err.message || "Failed to submit");
      }
    });
  }

  const loadMyBtn = el("load-my");
  if (loadMyBtn) {
    loadMyBtn.addEventListener("click", async () => {
      const num = el("my-enrollment")?.value.trim() ?? "";
      await loadMy(num);
    });
  }

  // prefill enrollment from user metadata if present
  supabase.auth.getUser().then(({ data }) => {
    const stored = data.user?.user_metadata?.enrollment_number ?? "";
    const myEnroll = el("my-enrollment");
    if (myEnroll) myEnroll.value = stored;
  }).catch(err => {
    console.warn("getUser failed:", err);
  });
}

// ---------------- Load Student Leaves ----------------
async function loadMy(num) {
  const body = el("my-rows");
  if (!body) return;
  body.innerHTML = "<tr><td colspan='9' style='padding:10px; text-align:center;'>Loading…</td></tr>";

  try {
    if (!num) {
      body.innerHTML = `<tr><td colspan='9' style='padding:10px; text-align:center;'>Enter enrollment number to load</td></tr>`;
      return;
    }

    const { data, error } = await supabase
      .from("leaves")
      .select("*")
      .eq("enrollment_number", num)
      .order("start_date", { ascending: false });

    if (error) throw error;
    renderRows(body, data || [], false);
  } catch (err) {
    console.error("loadMy error:", err);
    body.innerHTML = `<tr><td colspan='9' style='padding:10px; text-align:center; color:#b91c1c;'>${err.message || "Failed to load"}</td></tr>`;
  }
}

// ---------------- Admin ----------------
function bindAdmin() {
  // apply filters button (existing in your HTML)
  const applyBtn = el("apply-filters");
  if (applyBtn) applyBtn.addEventListener("click", loadAdmin);

  // auto-load admin data if user is admin
  // We'll also attempt to load once on bind to populate table (if admin)
  setTimeout(() => {
    if (role === "admin") loadAdmin();
  }, 200);
}

async function loadAdmin() {
  const body = el("admin-rows");
  if (!body) return;
  body.innerHTML = "<tr><td colspan='10' style='padding:10px; text-align:center;'>Loading…</td></tr>";

  try {
    const dept = el("f-dept")?.value.trim() ?? "";
    const sem = el("f-sem")?.value.trim() ?? "";
    const st = el("f-status")?.value ?? "";

    let query = supabase.from("leaves").select("*").order("start_date", { ascending: false });

    if (dept) query = query.eq("department", dept);
    if (sem) query = query.eq("semester", sem);
    if (st) query = query.eq("status", st);

    const { data, error } = await query;
    if (error) throw error;

    renderRows(body, data || [], true);
  } catch (err) {
    console.error("loadAdmin error:", err);
    body.innerHTML = `<tr><td colspan='10' style='padding:10px; text-align:center; color:#b91c1c;'>${err.message || "Failed to load"}</td></tr>`;
  }
}

// ---------------- Render Rows ----------------
function renderRows(body, rows, admin) {
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan='${admin ? 10 : 9}' style='padding:10px; text-align:center;'>No records</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const statusClass = r.status === "Approved" ? "pill approved" : r.status === "Rejected" ? "pill rejected" : "pill pending";
    const actions = admin ? `<td>
      <div class='flex-row'>
        <button data-act='approve' data-id='${r.id}' class='btn btn-primary' style='padding:6px 8px; font-size:12px;'>Approve</button>
        <button data-act='reject' data-id='${r.id}' class='btn btn-muted' style='padding:6px 8px; font-size:12px; background:#ef4444; color:#fff;'>Reject</button>
      </div>
    </td>` : "";
    return `<tr>
      <td>${escapeHtml(r.enrollment_number ?? "")}</td>
      <td>${escapeHtml(r.name ?? "")}</td>
      <td>${escapeHtml(r.course ?? "")}</td>
      <td>${escapeHtml(r.department ?? "")}</td>
      <td>${escapeHtml(r.semester ?? "")}</td>
      <td>${escapeHtml(r.start_date ?? "")}</td>
      <td>${escapeHtml(r.end_date ?? "")}</td>
      <td>${escapeHtml(r.reason ?? "")}</td>
      <td><span class='${statusClass}'>${escapeHtml(r.status ?? "")}</span></td>
      ${actions}
    </tr>`;
  }).join("");

  if (admin) attachAdminActions(body);
}

// ---------------- Admin Actions ----------------
function attachAdminActions(body) {
  if (!body) return;
  body.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const act = btn.dataset.act;
      if (!id) return alert("Row missing id.");
      const status = act === "approve" ? "Approved" : "Rejected";
      try {
        const { error } = await supabase.from("leaves").update({ status }).eq("id", id);
        if (error) throw error;
        // reload admin table
        await loadAdmin();
      } catch (err) {
        console.error("Admin action failed:", err);
        alert(err.message || "Failed to update status");
      }
    });
  });
}

// ---------------- Escape HTML ----------------
function escapeHtml(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str.replace(/[&<>\"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

// ---------------- Start App ----------------
init();
