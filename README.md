# CourseConnect

A student course registration and schedule management system. Students browse courses, register, join waitlists and see a weekly timetable; administrators manage courses, prerequisites, registrations and student records.

Built with React, TypeScript, Vite, Tailwind/shadcn-ui and Supabase (Postgres, Auth).

## How registration works

The rules are enforced by the database, so they apply no matter how a request is made:

- **Prerequisites:** a course can't be taken until its prerequisite courses are on the student's academic record. Admins record completed courses and grades under **Users → Record**. Circular prerequisites are rejected.
- **No timetable clashes:** a student can't register for two courses that overlap on the same day in the same semester.
- **Capacity and waitlists:** when a course is full, students join its waitlist. When someone drops (or an admin raises the capacity), the next eligible student on the waitlist is enrolled automatically.
- **Enrollment counts** update themselves.

## Roles

| Role | Can do |
|---|---|
| **Student** | Browse and register for courses, join and leave waitlists, drop courses, view their timetable and profile |
| **Admin** | Manage courses (including opening and closing registration), prerequisites and registrations; assign student IDs and roles; record completed courses |

Everyone signs up as a student. An admin can make other users admins under **Users**.

## Running locally

Requires Node.js 18+.

```sh
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev            # http://localhost:8080
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm test`.

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → the publishable / `anon` key (safe to expose in the browser; data is protected by row-level security) |
| `VITE_SUPABASE_PROJECT_ID` | The project ref (the subdomain in the URL) |

Never put the `service_role` / secret key in this app.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema in `supabase/migrations/` with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Authentication → URL Configuration:** set the Site URL to where the app is hosted, and add `https://<your-domain>/reset-password` (and `http://localhost:8080/reset-password` for local development) to the Redirect URLs.
4. Create the first administrator. Sign up in the app, then run this in the SQL editor:
   ```sql
   SELECT id FROM auth.users WHERE email = 'you@example.com';  -- copy the id
   UPDATE public.user_roles SET role = 'admin' WHERE user_id = '<that id>';
   ```
   After that, manage roles from **Users** in the app.

## Demo mode

For showing the project to others, the sign-in page can show **Try the demo** buttons that sign in as a sample **Admin** or **Student**, with a placeholder course catalog, classmates, prerequisites, a schedule clash and a waitlist.

1. Create or reset the demo accounts and placeholder data (safe to re-run at any time):
   ```sh
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
   ```
   The secret key is in Supabase → Project Settings → API Keys. Never put it in `.env` or commit it.
2. Set `VITE_DEMO_MODE=true` in `.env` (or in your host's settings) and restart or redeploy.

Demo accounts are walled off at the database level: they only see and change placeholder data, and real accounts never see it. Visitors share the demo accounts, so they can see each other's changes; re-run the seed script to reset the demo.

## Deploying

`npm run build` produces a static site in `dist/` that can be hosted on any static host (Vercel, Netlify, Cloudflare Pages, etc.). Configure the host to serve `index.html` for unknown paths (single-page app routing), and set the environment variables in the host's build settings.
