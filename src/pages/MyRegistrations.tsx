import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { errorMessage, formatTime } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Course = Database["public"]["Tables"]["courses"]["Row"];

export default function MyRegistrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registrations } = useQuery({
    queryKey: ["my-registrations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("registrations")
        .select("*, courses(*)")
        .eq("user_id", user!.id)
        .order("registered_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: waitlist } = useQuery({
    queryKey: ["my-waitlist", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_waitlist_positions");
      return new Map((data ?? []).map((w) => [w.course_id, w.waitlist_position]));
    },
    enabled: !!user,
  });

  // Dropping frees the seat for the next student on the waitlist.
  const dropMutation = useMutation({
    mutationFn: async (regId: string) => {
      const { error } = await supabase.rpc("drop_registration", { _registration_id: regId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["my-waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Done", description: "Your registrations have been updated." });
    },
    onError: (e) => toast({ title: "Couldn't drop course", description: errorMessage(e), variant: "destructive" }),
  });

  const confirmDrop = (regId: string, label: string, waitlisted: boolean) => {
    if (window.confirm(waitlisted ? `Leave the waitlist for ${label}?` : `Drop ${label}? Your seat may go to someone on the waitlist.`)) {
      dropMutation.mutate(regId);
    }
  };

  const active = registrations?.filter((r) => r.status !== "dropped") ?? [];
  const dropped = registrations?.filter((r) => r.status === "dropped") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">My Registrations</h1>
        <p className="text-muted-foreground">View and manage your enrolled courses</p>
      </div>

      {registrations && active.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No registrations yet. Browse courses to get started!</div>
      )}

      <div className="space-y-3">
        {active.map((reg) => {
          const course = reg.courses as Course | null;
          return (
            <Card key={reg.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{course?.code}</Badge>
                    <span className="font-medium">{course?.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {course?.day_of_week} {formatTime(course?.start_time)}–{formatTime(course?.end_time)} · {course?.room} · {course?.instructor} · {course?.semester}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Registered: {new Date(reg.registered_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={reg.status === "registered" ? "default" : "secondary"} className={reg.status === "registered" ? "bg-success/10 text-success border-success/20" : ""}>
                    {reg.status === "waitlisted" ? `Waitlist #${waitlist?.get(reg.course_id) ?? "…"}` : reg.status}
                  </Badge>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={dropMutation.isPending}
                    title={reg.status === "waitlisted" ? "Leave waitlist" : "Drop course"}
                    onClick={() => confirmDrop(reg.id, course?.code ?? "this course", reg.status === "waitlisted")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {dropped.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Dropped</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dropped.map((reg) => {
              const course = reg.courses as Course | null;
              return (
                <div key={reg.id} className="flex items-center justify-between text-sm text-muted-foreground">
                  <span><Badge variant="outline" className="mr-2">{course?.code}</Badge>{course?.name}</span>
                  <span className="text-xs">You can register again from Browse Courses</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
