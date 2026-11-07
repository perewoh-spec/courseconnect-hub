// Creates (or resets) the demo accounts and their placeholder data.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
//
// The secret key is in Supabase -> Project Settings -> API Keys. Never put it in .env or the app.
// Safe to re-run: it resets the demo accounts and replaces all demo courses and their data.
// Demo accounts carry app_metadata.demo = true and demo courses have is_demo = true; the database
// keeps that data completely separate from real accounts (see the demo isolation migration).

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}

const PASSWORD = "courseconnect-demo"; // must match DEMO_PASSWORD in src/lib/demo.ts
const ACCOUNTS = [
  { key: "admin", role: "admin", name: "Registrar (Demo)", email: "demo.admin@example.com", studentId: null },
  { key: "student", role: "student", name: "Amara Okafor", email: "demo.student@example.com", studentId: "DEMO-0001" },
  // Placeholder classmates so courses have enrollments and a waitlist. Nobody signs in as them.
  { key: "s2", role: "student", name: "Tunde Bakare", email: "demo.student2@example.com", studentId: "DEMO-0002" },
  { key: "s3", role: "student", name: "Zainab Musa", email: "demo.student3@example.com", studentId: "DEMO-0003" },
  { key: "s4", role: "student", name: "Kofi Mensah", email: "demo.student4@example.com", studentId: "DEMO-0004" },
];

const headers = { apikey: KEY, "Content-Type": "application/json" };
async function call(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...headers, ...extra }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const rest = (method, table, body, query = "") =>
  call(method, `/rest/v1/${table}${query}`, body, { Prefer: "return=representation" });

// 1. Accounts: create or reset, confirmed so they can sign in straight away.
const { users } = await call("GET", "/auth/v1/admin/users?per_page=1000");
const ids = {};
for (const a of ACCOUNTS) {
  const existing = users.find((u) => u.email === a.email);
  const attrs = { email: a.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: a.name }, app_metadata: { demo: true } };
  const user = existing
    ? await call("PUT", `/auth/v1/admin/users/${existing.id}`, attrs)
    : await call("POST", "/auth/v1/admin/users", attrs);
  ids[a.key] = user.id;
  await rest("PATCH", "profiles", { full_name: a.name, student_id: a.studentId }, `?user_id=eq.${user.id}`);
  // Exactly one role: add the right one, then remove any other.
  await call("POST", "/rest/v1/user_roles?on_conflict=user_id,role", { user_id: user.id, role: a.role }, { Prefer: "resolution=ignore-duplicates" });
  await rest("DELETE", "user_roles", null, `?user_id=eq.${user.id}&role=neq.${a.role}`);
}

// 2. Clear previous demo data (deleting demo courses cascades to their prerequisites,
//    registrations and completed records).
await rest("DELETE", "courses", null, "?is_demo=eq.true");

// 3. A small placeholder catalog.
const course = (code, name, day, start, end, capacity, instructor, room, description, extra = {}) => ({
  code, name, day_of_week: day, start_time: start, end_time: end, capacity, instructor, room, description,
  credits: 3, semester: "Fall 2026", is_active: true, is_demo: true, ...extra,
});
const created = await rest("POST", "courses", [
  course("CS101", "Introduction to Programming", "Monday", "09:00", "10:30", 40, "Dr. Ada Nwosu", "Lab 1", "Programming fundamentals in Python: variables, control flow, functions and debugging."),
  course("CS201", "Data Structures", "Wednesday", "10:00", "11:30", 35, "Dr. Ada Nwosu", "Lab 2", "Lists, stacks, queues, trees and hash tables, with complexity analysis."),
  course("CS210", "Databases", "Wednesday", "11:00", "12:30", 30, "Mr. Ibrahim Sule", "Room 204", "Relational design, SQL and transactions."),
  course("CS301", "Algorithms", "Thursday", "13:00", "14:30", 30, "Prof. Grace Eze", "Room 301", "Sorting, graph algorithms, dynamic programming and greedy methods."),
  course("MA101", "Calculus I", "Tuesday", "09:00", "10:30", 45, "Dr. Musa Danladi", "Hall A", "Limits, derivatives and an introduction to integrals."),
  course("MA201", "Linear Algebra", "Thursday", "09:00", "10:30", 40, "Dr. Musa Danladi", "Hall A", "Vectors, matrices, linear transformations and eigenvalues."),
  course("ST210", "Statistics for Scientists", "Tuesday", "14:00", "15:30", 25, "Dr. Funmi Adeyemi", "Room 105", "Probability, distributions, hypothesis testing and regression."),
  course("PH101", "Physics I: Mechanics", "Monday", "11:00", "12:30", 40, "Prof. Chinedu Obi", "Hall B", "Motion, forces, energy and momentum."),
  course("EN110", "Academic Writing", "Friday", "11:00", "12:00", 2, "Ms. Ruth Akpan", "Room 12", "Structuring arguments, citing sources and editing your own work.", { credits: 2 }),
  course("CS399", "Capstone Project", "Friday", "14:00", "17:00", 20, "Prof. Grace Eze", "Lab 3", "A semester-long team project. Registration opens next term.", { credits: 6, is_active: false }),
]);
const c = Object.fromEntries(created.map((row) => [row.code, row.id]));

// 4. Prerequisite chains.
await rest("POST", "prerequisites", [
  { course_id: c.CS201, prerequisite_course_id: c.CS101 },
  { course_id: c.CS210, prerequisite_course_id: c.CS101 },
  { course_id: c.CS301, prerequisite_course_id: c.CS201 },
  { course_id: c.MA201, prerequisite_course_id: c.MA101 },
  { course_id: c.ST210, prerequisite_course_id: c.MA101 },
  { course_id: c.CS399, prerequisite_course_id: c.CS301 },
]);

// 5. Academic records: the demo student has finished CS101 and MA101.
await rest("POST", "completed_courses", [
  { user_id: ids.student, course_id: c.CS101, grade: "A" },
  { user_id: ids.student, course_id: c.MA101, grade: "B" },
  { user_id: ids.s4, course_id: c.CS101, grade: "B" },
]);

// 6. Registrations. EN110 has 2 seats: two classmates fill it and the demo student is
//    first on the waitlist. CS210 clashes with CS201, so the student sees a schedule conflict.
const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
await rest("POST", "registrations", [
  { user_id: ids.student, course_id: c.CS201, status: "registered", registered_at: minutesAgo(300) },
  { user_id: ids.student, course_id: c.MA201, status: "registered", registered_at: minutesAgo(290) },
  { user_id: ids.student, course_id: c.ST210, status: "registered", registered_at: minutesAgo(280) },
  { user_id: ids.s2, course_id: c.CS101, status: "registered", registered_at: minutesAgo(250) },
  { user_id: ids.s2, course_id: c.EN110, status: "registered", registered_at: minutesAgo(240) },
  { user_id: ids.s3, course_id: c.EN110, status: "registered", registered_at: minutesAgo(230) },
  { user_id: ids.s3, course_id: c.MA101, status: "registered", registered_at: minutesAgo(220) },
  { user_id: ids.student, course_id: c.EN110, status: "waitlisted", registered_at: minutesAgo(200) },
  { user_id: ids.s4, course_id: c.CS201, status: "registered", registered_at: minutesAgo(180) },
  { user_id: ids.s4, course_id: c.EN110, status: "waitlisted", registered_at: minutesAgo(170) },
  { user_id: ids.s4, course_id: c.PH101, status: "dropped", registered_at: minutesAgo(160) },
]);

console.log("Demo ready. Sign-in accounts (password: %s):", PASSWORD);
for (const a of ACCOUNTS.slice(0, 2)) console.log(`  ${a.role.padEnd(8)} ${a.email}`);
