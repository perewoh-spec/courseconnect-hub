-- ============================================================
-- Demo isolation: shared demo accounts (app_metadata.demo = true, which only the server
-- can set) see and change only placeholder data, and real accounts never see it.
-- One RESTRICTIVE policy per table, ANDed with the existing policies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'demo')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.user_is_demo(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT (raw_app_meta_data ->> 'demo')::boolean FROM auth.users WHERE id = _user_id), false)
$$;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.courses ALTER COLUMN is_demo SET DEFAULT public.current_user_is_demo();

CREATE OR REPLACE FUNCTION public.course_is_demo(_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_demo FROM public.courses WHERE id = _course_id), false)
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.course_is_demo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_is_demo(uuid) TO authenticated;

-- ------------------------------------------------------------
-- The wall.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Demo isolation" ON public.courses;
CREATE POLICY "Demo isolation" ON public.courses AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_demo = public.current_user_is_demo())
  WITH CHECK (is_demo = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.prerequisites;
CREATE POLICY "Demo isolation" ON public.prerequisites AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.course_is_demo(course_id) = public.current_user_is_demo())
  WITH CHECK (public.course_is_demo(course_id) = public.current_user_is_demo()
              AND public.course_is_demo(prerequisite_course_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.registrations;
CREATE POLICY "Demo isolation" ON public.registrations AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo()
              AND public.course_is_demo(course_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.completed_courses;
CREATE POLICY "Demo isolation" ON public.completed_courses AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo()
              AND public.course_is_demo(course_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.profiles;
CREATE POLICY "Demo isolation" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.user_roles;
CREATE POLICY "Demo isolation" ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo());

-- ------------------------------------------------------------
-- Server-side functions bypass row security, so the data itself is checked too:
-- a registration or completed course must pair a student and course from the same side,
-- and prerequisites can't link a demo course to a real one.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_same_side()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'prerequisites' THEN
    IF public.course_is_demo(NEW.course_id) <> public.course_is_demo(NEW.prerequisite_course_id) THEN
      RAISE EXCEPTION 'Course not found';
    END IF;
  ELSIF public.user_is_demo(NEW.user_id) <> public.course_is_demo(NEW.course_id) THEN
    RAISE EXCEPTION 'This course is not open for registration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_same_side ON public.registrations;
CREATE TRIGGER trg_same_side BEFORE INSERT OR UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.check_same_side();
DROP TRIGGER IF EXISTS trg_same_side ON public.completed_courses;
CREATE TRIGGER trg_same_side BEFORE INSERT OR UPDATE ON public.completed_courses
FOR EACH ROW EXECUTE FUNCTION public.check_same_side();
DROP TRIGGER IF EXISTS trg_same_side ON public.prerequisites;
CREATE TRIGGER trg_same_side BEFORE INSERT OR UPDATE ON public.prerequisites
FOR EACH ROW EXECUTE FUNCTION public.check_same_side();

-- Admins can only drop registrations and change roles on their own side.
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
  IF NOT FOUND
     OR (v_reg.user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'))
     OR public.user_is_demo(v_reg.user_id) <> public.current_user_is_demo() THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;
  IF v_reg.status = 'dropped' THEN RETURN; END IF;

  UPDATE public.registrations SET status = 'dropped' WHERE id = _registration_id;
  IF v_reg.status = 'registered' THEN
    PERFORM public.promote_waitlist(v_reg.course_id);
  END IF;
END;
$$;

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
  IF public.user_is_demo(_user_id) <> public.current_user_is_demo() THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF _user_id = auth.uid() AND _role <> 'admin' THEN
    RAISE EXCEPTION 'You can''t remove your own admin role. Ask another administrator.';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> _role;
END;
$$;

-- The "last admin" safeguard counts real and demo admins separately.
CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.user_id <> OLD.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE role = 'admin' AND id <> OLD.id
         AND public.user_is_demo(user_id) = public.user_is_demo(OLD.user_id)
     ) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_same_side() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.drop_registration(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drop_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role) TO authenticated;
