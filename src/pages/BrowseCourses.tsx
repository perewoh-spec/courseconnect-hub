import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertTriangle, CheckCircle, Users, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { errorMessage, formatTime } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Course = Database["public"]["Tables"]["courses"]["Row"];

export default function BrowseCourses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [semester, setSemester] = useState("all");

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  const { data: prerequisites } = useQuery({
    queryKey: ["prerequisites"],
    queryFn: async () => {
      const { data } = await supabase.from("prerequisites").select("*, courses!prerequisites_prerequisite_course_id_fkey(code, name)");
      return data ?? [];
    },
  });

  const { data: completedCourses } = useQuery({
    queryKey: ["my-completed", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("completed_courses").select("course_id").eq("user_id", user!.id);
      return data?.map((c) => c.course_id) ?? [];
    },
    enabled: !!user,
  });

  const { data: myRegistrations } = useQuery({
    queryKey: ["my-registrations", user?.id],
    queryFn: async () => {
      // Registered and waitlisted courses; dropped ones can be registered for again.
      const { data } = await supabase.from("registrations").select("course_id, status, courses(*)").eq("user_id", user!.id).in("status", ["registered", "waitlisted"]);
      return data ?? [];
    },
    enabled: !!user,
  });

  // The database checks prerequisites, conflicts and capacity, and waitlists the student if full.
  const registerMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { data, error } = await supabase.rpc("register_for_course", { _course_id: courseId });
      if (error) throw error;
      return data;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-waitlist"] });
      if (status === "waitlisted") {
        toast({ title: "Added to waitlist", description: "The course is full. You'll be enrolled automatically if a seat opens." });
      } else {
        toast({ title: "Registered!", description: "You've been successfully enrolled." });
      }
    },
    onError: (e) => {
      toast({ title: "Registration failed", description: errorMessage(e), variant: "destructive" });
    },
  });

  const registeredIds = new Set(myRegistrations?.filter((r) => r.status === "registered").map((r) => r.course_id));
  const waitlistedIds = new Set(myRegistrations?.filter((r) => r.status === "waitlisted").map((r) => r.course_id));
  const semesters = [...new Set(courses?.map((c) => c.semester))].sort();

  const getPrereqs = (courseId: string) =>
    prerequisites?.filter((p) => p.course_id === courseId) ?? [];

  const hasMetPrereqs = (courseId: string) => {
    const prereqs = getPrereqs(courseId);
    return prereqs.every((p) => completedCourses?.includes(p.prerequisite_course_id));
  };

  const hasScheduleConflict = (courseId: string) => {
    const course = courses?.find((c) => c.id === courseId);
    if (!course) return false;
    return myRegistrations?.some((r) => {
      const rc = r.courses as Course | null;
      if (!rc || rc.id === courseId || r.status !== "registered") return false;
      return rc.semester === course.semester &&
        rc.day_of_week === course.day_of_week &&
        rc.start_time < course.end_time &&
        rc.end_time > course.start_time;
    }) ?? false;
  };

  const filtered = courses?.filter((c) =>
    (semester === "all" || c.semester === semester) &&
    (c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.instructor ?? "").toLowerCase().includes(search.toLowerCase()))
  ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Browse Courses</h1>
        <p className="text-muted-foreground">Find and register for available courses</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by code, name or instructor..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {semesters.length > 1 && (
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((course, i) => {
          const prereqs = getPrereqs(course.id);
          const metPrereqs = hasMetPrereqs(course.id);
          const conflict = hasScheduleConflict(course.id);
          const isRegistered = registeredIds.has(course.id);
          const isWaitlisted = waitlistedIds.has(course.id);
          const isCompleted = completedCourses?.includes(course.id);
          const isFull = course.enrolled_count >= course.capacity;
          const canRegister = metPrereqs && !conflict && !isRegistered && !isWaitlisted && !isCompleted;

          return (
            <motion.div key={course.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="mb-2">{course.code}</Badge>
                      <CardTitle className="font-heading text-base">{course.name}</CardTitle>
                    </div>
                    <Badge variant="secondary">{course.credits} cr</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
                  )}

                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {course.day_of_week} {formatTime(course.start_time)}–{formatTime(course.end_time)}
                      {semesters.length > 1 && <span>· {course.semester}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {course.enrolled_count}/{course.capacity} enrolled
                      {isFull && <Badge variant="secondary" className="ml-1">Full</Badge>}
                    </div>
                    {course.instructor && (
                      <div className="text-muted-foreground">Instructor: {course.instructor}</div>
                    )}
                  </div>

                  {prereqs.length > 0 && (
                    <div className="text-xs space-y-1">
                      <span className="font-medium">Prerequisites:</span>
                      {prereqs.map((p) => {
                        const prereqCourse = (p as { courses?: { code: string; name: string } | null }).courses;
                        const met = completedCourses?.includes(p.prerequisite_course_id);
                        return (
                          <div key={p.id} className="flex items-center gap-1.5">
                            {met ? <CheckCircle className="h-3 w-3 text-success" /> : <AlertTriangle className="h-3 w-3 text-destructive" />}
                            <span className={met ? "text-success" : "text-destructive"}>
                              {prereqCourse?.code ?? "Unknown"} — {prereqCourse?.name ?? ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {conflict && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" /> Schedule conflict detected
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    {isRegistered ? (
                      <Badge className="bg-success/10 text-success border-success/20">Registered</Badge>
                    ) : isWaitlisted ? (
                      <Badge variant="secondary">On waitlist</Badge>
                    ) : isCompleted ? (
                      <Badge variant="outline">Completed</Badge>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        variant={isFull && canRegister ? "outline" : "default"}
                        disabled={!canRegister || registerMutation.isPending}
                        onClick={() => registerMutation.mutate(course.id)}
                      >
                        {!metPrereqs ? "Prerequisites Not Met" : conflict ? "Schedule Conflict" : isFull ? "Join Waitlist" : "Register"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No courses found.</div>
      )}
    </div>
  );
}
