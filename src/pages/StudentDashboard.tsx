import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { BookOpen, Calendar, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { formatTime } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Course = Database["public"]["Tables"]["courses"]["Row"];

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data: registrations } = useQuery({
    queryKey: ["my-registrations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("registrations")
        .select("*, courses(*)")
        .eq("user_id", user!.id)
        .in("status", ["registered", "waitlisted"]);
      return data ?? [];
    },
    enabled: !!user,
  });

  const registered = registrations?.filter((r) => r.status === "registered") ?? [];
  const waitlistedCount = registrations?.filter((r) => r.status === "waitlisted").length ?? 0;

  const { data: completed } = useQuery({
    queryKey: ["my-completed", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("completed_courses")
        .select("*")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const totalCredits = registered.reduce((sum, r) => sum + ((r.courses as Course | null)?.credits ?? 0), 0);
  const semesters = [...new Set(registered.map((r) => (r.courses as Course | null)?.semester).filter(Boolean))];

  const stats = [
    { label: "Registered Courses", value: registered.length, icon: BookOpen, color: "text-primary",
      note: waitlistedCount > 0 ? `+ ${waitlistedCount} on waitlist` : undefined },
    { label: "Total Credits", value: totalCredits, icon: Clock, color: "text-secondary" },
    { label: "Completed Courses", value: completed?.length ?? 0, icon: CheckCircle, color: "text-success" },
    { label: semesters.length > 1 ? "Semesters" : "Semester", value: semesters.length ? semesters.join(", ") : "—", icon: Calendar, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}!
        </h1>
        <p className="text-muted-foreground">Here's your academic overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-heading font-bold">{stat.value}</div>
                {stat.note && <p className="text-xs text-muted-foreground mt-1">{stat.note}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {registrations && registered.length === 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
            <p className="text-muted-foreground">You're not registered for any courses yet.</p>
            <Button asChild><Link to="/courses">Browse Courses <ArrowRight className="h-4 w-4 ml-2" /></Link></Button>
          </CardContent>
        </Card>
      )}

      {registered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Current Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {registered.map((reg) => {
                const course = reg.courses as Course | null;
                return (
                  <div key={reg.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{course?.code} — {course?.name}</div>
                      <div className="text-sm text-muted-foreground">{course?.day_of_week} {formatTime(course?.start_time)}–{formatTime(course?.end_time)} · {course?.room}</div>
                    </div>
                    <div className="text-sm font-medium text-primary">{course?.credits} cr</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
