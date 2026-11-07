import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";
import { errorMessage } from "@/lib/utils";

export default function AdminRegistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: registrations, isLoading } = useQuery({
    queryKey: ["admin-registrations"],
    queryFn: async () => {
      const { data: regs } = await supabase
        .from("registrations")
        .select("*, courses(code, name, semester)")
        .order("registered_at", { ascending: false });
      if (!regs) return [];
      const userIds = [...new Set(regs.map((r) => r.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email, student_id").in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      return regs.map((r) => ({ ...r, profile: profileMap.get(r.user_id) ?? null }));
    },
  });

  // Uses the same drop as students, so the freed seat goes to the waitlist.
  const dropMutation = useMutation({
    mutationFn: async (regId: string) => {
      const { error } = await supabase.rpc("drop_registration", { _registration_id: regId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Registration dropped" });
    },
    onError: (e) => toast({ title: "Couldn't drop", description: errorMessage(e), variant: "destructive" }),
  });

  const q = search.trim().toLowerCase();
  const filtered = (registrations ?? []).filter((r) => {
    if (statusFilter === "active" ? r.status === "dropped" : statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.profile?.full_name, r.profile?.email, r.profile?.student_id, r.courses?.code, r.courses?.name]
      .some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">All Registrations</h1>
        <p className="text-muted-foreground">Monitor student enrollment across all courses</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search student, ID or course..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Registered + waitlist</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="waitlisted">Waitlisted</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              )}
              {filtered.map((reg) => {
                const course = reg.courses;
                const profile = reg.profile;
                return (
                  <TableRow key={reg.id}>
                    <TableCell>
                      <div>{profile?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{profile?.email}{profile?.student_id ? ` · ${profile.student_id}` : ""}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="mr-2">{course?.code}</Badge>
                      {course?.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={reg.status === "registered" ? "default" : "secondary"} className={`capitalize ${reg.status === "registered" ? "bg-success/10 text-success border-success/20" : ""}`}>
                        {reg.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(reg.registered_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {reg.status !== "dropped" && (
                        <Button variant="ghost" size="sm" className="text-destructive" disabled={dropMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Drop ${profile?.full_name || "this student"} from ${course?.code}?`)) dropMutation.mutate(reg.id);
                          }}>
                          Drop
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No registrations found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
