import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, ClipboardList, AlertTriangle, Hourglass } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { data: courseCount } = useQuery({
    queryKey: ["admin-course-count"],
    queryFn: async () => {
      const { count } = await supabase.from("courses").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: regCount } = useQuery({
    queryKey: ["admin-reg-count"],
    queryFn: async () => {
      const { count } = await supabase.from("registrations").select("*", { count: "exact", head: true }).eq("status", "registered");
      return count ?? 0;
    },
  });

  const { data: prereqCount } = useQuery({
    queryKey: ["admin-prereq-count"],
    queryFn: async () => {
      const { count } = await supabase.from("prerequisites").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  // Students only; admins have accounts too but aren't students.
  const { data: studentCount } = useQuery({
    queryKey: ["admin-student-count"],
    queryFn: async () => {
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "student");
      return count ?? 0;
    },
  });

  const { data: waitlistCount } = useQuery({
    queryKey: ["admin-waitlist-count"],
    queryFn: async () => {
      const { count } = await supabase.from("registrations").select("*", { count: "exact", head: true }).eq("status", "waitlisted");
      return count ?? 0;
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("code");
      return data ?? [];
    },
  });

  // Fullest open courses first.
  const byFill = [...(courses ?? [])]
    .filter((c) => c.is_active)
    .sort((a, b) => b.enrolled_count / b.capacity - a.enrolled_count / a.capacity);

  const stats = [
    { label: "Total Courses", value: courseCount ?? 0, icon: BookOpen, color: "text-primary" },
    { label: "Active Registrations", value: regCount ?? 0, icon: ClipboardList, color: "text-secondary" },
    { label: "On Waitlists", value: waitlistCount ?? 0, icon: Hourglass, color: "text-accent" },
    { label: "Students", value: studentCount ?? 0, icon: Users, color: "text-success" },
    { label: "Prerequisites Defined", value: prereqCount ?? 0, icon: AlertTriangle, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">System overview and management</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-heading font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Enrollment by Course</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {byFill.length === 0 && <p className="text-sm text-muted-foreground">No open courses yet.</p>}
          {byFill.map((c) => {
            const pct = Math.min(100, Math.round((c.enrolled_count / c.capacity) * 100));
            return (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate"><Badge variant="outline" className="mr-2">{c.code}</Badge>{c.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {c.enrolled_count}/{c.capacity}
                    {c.enrolled_count >= c.capacity && <Badge variant="secondary" className="ml-2">Full</Badge>}
                  </span>
                </div>
                <Progress value={pct} className="h-2" aria-label={`${c.code} ${pct}% full`} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
