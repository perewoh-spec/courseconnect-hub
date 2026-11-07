-- ============================================================
-- 1. Privacy: students see only their own profile; admins see and edit all.
--    Student IDs and emails can only be changed by admins.
-- ============================================================
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile, admins view all" ON public.profiles;
CREATE POLICY "Users view own profile, admins view all" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin')
     AND (NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.email IS DISTINCT FROM OLD.email) THEN
    RAISE EXCEPTION 'Only an administrator can change student IDs and emails';
  END IF;
  NEW.student_id := NULLIF(trim(NEW.student_id), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_student_id_unique ON public.profiles (student_id) WHERE student_id IS NOT NULL;

-- ============================================================
-- 2. Course data checks (NOT VALID: enforced for new and edited rows only).
-- ============================================================
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_time_order;
ALTER TABLE public.courses ADD CONSTRAINT courses_time_order CHECK (end_time > start_time) NOT VALID;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_credits_range;
ALTER TABLE public.courses ADD CONSTRAINT courses_credits_range CHECK (credits BETWEEN 1 AND 6) NOT VALID;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_capacity_positive;
ALTER TABLE public.courses ADD CONSTRAINT courses_capacity_positive CHECK (capacity >= 1) NOT VALID;

-- No circular prerequisites (A needs B and B needs A would block both forever).
CREATE OR REPLACE FUNCTION public.prevent_prerequisite_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE chain(course_id) AS (
      SELECT p.prerequisite_course_id FROM public.prerequisites p WHERE p.course_id = NEW.prerequisite_course_id
      UNION
      SELECT p.prerequisite_course_id FROM public.prerequisites p JOIN chain c ON p.course_id = c.course_id
    )
    SELECT 1 FROM chain WHERE course_id = NEW.course_id
  ) OR NEW.prerequisite_course_id = NEW.course_id THEN
    RAISE EXCEPTION 'This would create a circular prerequisite chain';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_prerequisite_cycle ON public.prerequisites;
CREATE TRIGGER trg_prevent_prerequisite_cycle
BEFORE INSERT OR UPDATE ON public.prerequisites
FOR EACH ROW EXECUTE FUNCTION public.prevent_prerequisite_cycle();

-- ============================================================
-- 3. Enrollment counts stay correct automatically (they were never updated).
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_enrolled_count(_course_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.courses c
  SET enrolled_count = (SELECT count(*) FROM public.registrations r WHERE r.course_id = c.id AND r.status = 'registered')
  WHERE c.id = _course_id
$$;

CREATE OR REPLACE FUNCTION public.on_registration_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_enrolled_count(OLD.course_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.course_id <> OLD.course_id) THEN
    PERFORM public.refresh_enrolled_count(NEW.course_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_registration_change ON public.registrations;
CREATE TRIGGER trg_registration_change
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.on_registration_change();

UPDATE public.courses c
SET enrolled_count = (SELECT count(*) FROM public.registrations r WHERE r.course_id = c.id AND r.status = 'registered');

-- ============================================================
-- 4. Registration rules are enforced by the database, not just the browser.
--    Students no longer write registrations directly; they go through these functions.
-- ============================================================
DROP POLICY IF EXISTS "Users can register" ON public.registrations;
DROP POLICY IF EXISTS "Users can drop own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Users can delete own registrations" ON public.registrations;

-- Why a student can't take a course right now, or NULL if they can.
CREATE OR REPLACE FUNCTION public.registration_blocker(_user_id uuid, _course_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_missing text;
  v_conflict text;
BEGIN
  SELECT * INTO v_course FROM public.courses WHERE id = _course_id;
  IF NOT FOUND OR NOT v_course.is_active THEN
    RETURN 'This course is not open for registration';
  END IF;

  SELECT string_agg(pc.code, ', ' ORDER BY pc.code) INTO v_missing
  FROM public.prerequisites p
  JOIN public.courses pc ON pc.id = p.prerequisite_course_id
  WHERE p.course_id = _course_id
    AND NOT EXISTS (SELECT 1 FROM public.completed_courses cc WHERE cc.user_id = _user_id AND cc.course_id = p.prerequisite_course_id);
  IF v_missing IS NOT NULL THEN
    RETURN 'Missing prerequisites: ' || v_missing;
  END IF;

  SELECT c.code || ' (' || c.day_of_week || ' ' || to_char(c.start_time, 'HH24:MI') || '–' || to_char(c.end_time, 'HH24:MI') || ')'
  INTO v_conflict
  FROM public.registrations r
  JOIN public.courses c ON c.id = r.course_id
  WHERE r.user_id = _user_id AND r.status = 'registered' AND c.id <> _course_id
    AND c.semester = v_course.semester AND c.day_of_week = v_course.day_of_week
    AND c.start_time < v_course.end_time AND c.end_time > v_course.start_time
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RETURN 'Schedule conflict with ' || v_conflict;
  END IF;

  RETURN NULL;
END;
$$;

-- Registers the signed-in student, or puts them on the waitlist if the course is full.
-- Returns 'registered' or 'waitlisted'.
CREATE OR REPLACE FUNCTION public.register_for_course(_course_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_course public.courses%ROWTYPE;
  v_existing public.registrations%ROWTYPE;
  v_blocker text;
  v_status text;
  v_has_row boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;

  -- Lock the course so two students can't take the last seat at the same time.
  SELECT * INTO v_course FROM public.courses WHERE id = _course_id FOR UPDATE;

  SELECT * INTO v_existing FROM public.registrations WHERE user_id = v_uid AND course_id = _course_id;
  v_has_row := FOUND;
  IF v_has_row AND v_existing.status = 'registered' THEN RAISE EXCEPTION 'You are already registered for this course'; END IF;
  IF v_has_row AND v_existing.status = 'waitlisted' THEN RAISE EXCEPTION 'You are already on the waitlist for this course'; END IF;
  IF EXISTS (SELECT 1 FROM public.completed_courses WHERE user_id = v_uid AND course_id = _course_id) THEN
    RAISE EXCEPTION 'You have already completed this course';
  END IF;

  v_blocker := public.registration_blocker(v_uid, _course_id);
  IF v_blocker IS NOT NULL THEN RAISE EXCEPTION '%', v_blocker; END IF;

  v_status := CASE
    WHEN (SELECT count(*) FROM public.registrations WHERE course_id = _course_id AND status = 'registered') >= v_course.capacity
      THEN 'waitlisted' ELSE 'registered' END;

  IF v_has_row THEN
    UPDATE public.registrations SET status = v_status, registered_at = now() WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.registrations (user_id, course_id, status) VALUES (v_uid, _course_id, v_status);
  END IF;
  RETURN v_status;
END;
$$;

-- Fills free seats from the waitlist in order, skipping students who no longer qualify.
CREATE OR REPLACE FUNCTION public.promote_waitlist(_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_reg record;
BEGIN
  SELECT * INTO v_course FROM public.courses WHERE id = _course_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  FOR v_reg IN
    SELECT id, user_id FROM public.registrations
    WHERE course_id = _course_id AND status = 'waitlisted'
    ORDER BY registered_at
  LOOP
    EXIT WHEN (SELECT count(*) FROM public.registrations WHERE course_id = _course_id AND status = 'registered') >= v_course.capacity;
    IF public.registration_blocker(v_reg.user_id, _course_id) IS NULL THEN
      UPDATE public.registrations SET status = 'registered' WHERE id = v_reg.id;
    END IF;
  END LOOP;
END;
$$;

-- Drops a course (or leaves its waitlist). Students can drop their own; admins can drop anyone's.
-- The row is kept as 'dropped' for the record, and the freed seat goes to the waitlist.
CREATE OR REPLACE FUNCTION public.drop_registration(_registration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND OR (v_reg.user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;
  IF v_reg.status = 'dropped' THEN RETURN; END IF;

  UPDATE public.registrations SET status = 'dropped' WHERE id = _registration_id;
  IF v_reg.status = 'registered' THEN
    PERFORM public.promote_waitlist(v_reg.course_id);
  END IF;
END;
$$;

-- Raising a course's capacity lets waitlisted students in automatically.
CREATE OR REPLACE FUNCTION public.on_course_capacity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.capacity > OLD.capacity THEN
    PERFORM public.promote_waitlist(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_capacity_change ON public.courses;
CREATE TRIGGER trg_course_capacity_change
AFTER UPDATE OF capacity ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.on_course_capacity_change();

-- The signed-in student's place in each waitlist they're on.
CREATE OR REPLACE FUNCTION public.my_waitlist_positions()
RETURNS TABLE (course_id uuid, waitlist_position bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mine.course_id,
         (SELECT count(*) FROM public.registrations w
          WHERE w.course_id = mine.course_id AND w.status = 'waitlisted' AND w.registered_at <= mine.registered_at)
  FROM public.registrations mine
  WHERE mine.user_id = auth.uid() AND mine.status = 'waitlisted'
$$;

-- ============================================================
-- 5. Roles: exactly one role per user, changed atomically by admins, and the
--    system can never be left without an administrator.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change roles';
  END IF;
  IF _user_id = auth.uid() AND _role <> 'admin' THEN
    RAISE EXCEPTION 'You can''t remove your own admin role. Ask another administrator.';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> _role;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.user_id <> OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_removing_last_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_removing_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_removing_last_admin();

-- ============================================================
-- Permissions on the new functions.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.refresh_enrolled_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_waitlist(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_registration_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_course_capacity_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_prerequisite_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registration_blocker(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.register_for_course(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.drop_registration(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_waitlist_positions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drop_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_waitlist_positions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) TO authenticated;
