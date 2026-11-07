import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTime, toMinutes } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Course = Database["public"]["Tables"]["courses"]["Row"];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HOUR_HEIGHT = 60; // px per hour, so 1px per minute

export default function Schedule() {
  const { user } = useAuth();
  const [semesterChoice, setSemesterChoice] = useState<string | null>(null);

  const { data: registrations } = useQuery({
    queryKey: ["my-registrations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("registrations")
        .select("*, courses(*)")
        .eq("user_id", user!.id)
        .eq("status", "registered");
      return data ?? [];
    },
    enabled: !!user,
  });

  const colors = [
    "bg-primary/15 border-primary/30 text-primary",
    "bg-secondary/15 border-secondary/30 text-secondary",
    "bg-accent/15 border-accent/30 text-accent-foreground",
    "bg-success/15 border-success/30 text-success",
    "bg-muted border-border text-foreground",
  ];

  const getCourseStyle = (index: number) => colors[index % colors.length];

  // One semester at a time; default to the first one the student is registered in.
  const semesters = [...new Set(registrations?.map((r) => (r.courses as Course | null)?.semester).filter(Boolean))].sort() as string[];
  const semester = semesterChoice ?? semesters[0] ?? null;
  const shown = registrations?.filter((r) => (r.courses as Course | null)?.semester === semester) ?? [];

  // Show 8:00–19:00, stretched to fit any earlier or later classes.
  const starts = shown.map((r) => toMinutes((r.courses as Course).start_time));
  const ends = shown.map((r) => toMinutes((r.courses as Course).end_time));
  const firstHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(19, ...ends.map((m) => Math.ceil(m / 60)));
  const HOURS = Array.from({ length: lastHour - firstHour }, (_, i) => i + firstHour);

  // Each class is drawn in the cell of the hour it starts in, offset by its start minute.
  const getCoursesStartingAt = (day: string, hour: number) =>
    shown.filter((reg) => {
      const course = reg.courses as Course | null;
      return !!course && course.day_of_week === day && Math.floor(toMinutes(course.start_time) / 60) === hour;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Weekly Schedule</h1>
          <p className="text-muted-foreground">Your conflict-free academic timetable</p>
        </div>
        {semesters.length > 1 && (
          <Select value={semester ?? undefined} onValueChange={setSemesterChoice}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{semesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {registrations && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">You're not registered for any courses yet. Browse courses to build your timetable.</p>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-6 border-b">
              <div className="p-3 text-sm font-medium text-muted-foreground">Time</div>
              {DAYS.map((day) => (
                <div key={day} className="p-3 text-sm font-medium text-center border-l">{day}</div>
              ))}
            </div>
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-6 border-b last:border-b-0" style={{ height: HOUR_HEIGHT }}>
                <div className="p-3 text-xs text-muted-foreground flex items-start">
                  {hour.toString().padStart(2, "0")}:00
                </div>
                {DAYS.map((day) => {
                  const coursesHere = getCoursesStartingAt(day, hour);
                  return (
                    <div key={day} className="border-l relative">
                      {coursesHere.map((reg) => {
                        const course = reg.courses as Course;
                        const start = toMinutes(course.start_time);
                        const duration = toMinutes(course.end_time) - start;
                        const regIndex = registrations?.indexOf(reg) ?? 0;
                        return (
                          <div
                            key={reg.id}
                            className={`absolute inset-x-1 overflow-hidden rounded-md border p-1.5 text-xs ${getCourseStyle(regIndex)}`}
                            style={{ top: `${((start % 60) / 60) * HOUR_HEIGHT + 2}px`, height: `${(duration / 60) * HOUR_HEIGHT - 4}px`, zIndex: 10 }}
                            title={`${course.code} — ${course.name}\n${formatTime(course.start_time)}–${formatTime(course.end_time)} · ${course.room ?? ""}`}
                          >
                            <div className="font-semibold">{course.code}</div>
                            <div className="opacity-80">{formatTime(course.start_time)}–{formatTime(course.end_time)}</div>
                            <div className="opacity-80">{course.room}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
