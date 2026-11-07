// Demo mode lets visitors sign in to ready-made accounts to explore each role.
// Turn it on with VITE_DEMO_MODE=true and create the accounts with `npm run seed:demo`.
// Demo accounts only ever see placeholder data; the database keeps it separate from real data.

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_PASSWORD = "courseconnect-demo";

export const DEMO_ACCOUNTS = [
  { role: "admin", label: "Admin", email: "demo.admin@example.com", description: "Courses, prerequisites, registrations, users" },
  { role: "student", label: "Student", email: "demo.student@example.com", description: "Browse, register, waitlists, timetable" },
] as const;

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_ACCOUNTS.some((a) => a.email === email.toLowerCase());
}
