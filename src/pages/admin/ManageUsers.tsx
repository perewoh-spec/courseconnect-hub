import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Search, Pencil, GraduationCap, Trash2, Plus, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type UserRow = Profile & { role: AppRole };

const GRADES = ["A", "B", "C", "D", "E", "F", "Pass"];

export default function ManageUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<{ student_id: string; role: AppRole }>({ student_id: "", role: "student" });
  const [recordFor, setRecordFor] = useState<UserRow | null>(null);
  const [newCompleted, setNewCompleted] = useState({ course_id: "", grade: "" });

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map<string, AppRole>();
      (roles ?? []).forEach((r) => {
        if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
      });
      return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.user_id) ?? "student" })) as UserRow[];
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("code");
      return data ?? [];
    },
  });

  const { data: record } = useQuery({
    queryKey: ["admin-academic-record", recordFor?.user_id],
    queryFn: async () => {
      const [{ data: completed }, { data: regs }] = await Promise.all([
        supabase.from("completed_courses").select("*, courses(code, name, credits)").eq("user_id", recordFor!.user_id).order("completed_at", { ascending: false }),
        supabase.from("registrations").select("*, courses(code, name)").eq("user_id", recordFor!.user_id).neq("status", "dropped"),
      ]);
      return { completed: completed ?? [], registrations: regs ?? [] };
    },
    enabled: !!recordFor,
  });

  const saveUser = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const studentId = editForm.student_id.trim() || null;
      if (studentId !== editing.student_id) {
        const { error } = await supabase.from("profiles").update({ student_id: studentId }).eq("user_id", editing.user_id);
        if (error) throw error;
      }
      if (editForm.role !== editing.role) {
        const { error } = await supabase.rpc("set_user_role", { _user_id: editing.user_id, _role: editForm.role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User updated" });
      setEditing(null);
    },
    onError: (e) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" }),
  });

  const addCompleted = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("completed_courses").insert({
        user_id: recordFor!.user_id, course_id: newCompleted.course_id, grade: newCompleted.grade || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-academic-record"] });
      setNewCompleted({ course_id: "", grade: "" });
      toast({ title: "Completed course recorded" });
    },
    onError: (e) => toast({ title: "Error", description: errorMessage(e).includes("duplicate") ? "This course is already on the record." : errorMessage(e), variant: "destructive" }),
  });

  const removeCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("completed_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-academic-record"] }),
    onError: (e) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" }),
  });

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditForm({ student_id: u.student_id ?? "", role: u.role });
  };

  const q = search.trim().toLowerCase();
  const filtered = (users ?? []).filter((u) =>
    !q || [u.full_name, u.email, u.student_id].some((v) => v?.toLowerCase().includes(q))
  );
  const completedIds = new Set(record?.completed.map((c) => c.course_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">Assign student IDs and roles, and record completed courses</p>
        <p className="text-xs text-muted-foreground mt-1">
          New users sign up on the login page as students. Completed courses are what unlock prerequisites.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email or student ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>{u.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>{u.student_id || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {u.role === "student" && (
                        <Button variant="ghost" size="sm" onClick={() => setRecordFor(u)}><GraduationCap className="h-4 w-4 mr-1" />Record</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit user */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Edit User</DialogTitle>
            <DialogDescription>{editing?.full_name || editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Student ID</Label>
              <Input value={editForm.student_id} onChange={(e) => setEditForm((f) => ({ ...f, student_id: e.target.value }))} placeholder="e.g. STU-2026-0042" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as AppRole }))}
                disabled={editing?.user_id === currentUser?.id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {editing?.user_id === currentUser?.id && (
                <p className="text-xs text-muted-foreground">You can't change your own role.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveUser.mutate()} disabled={saveUser.isPending}>
              {saveUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Academic record */}
      <Dialog open={!!recordFor} onOpenChange={(o) => { if (!o) { setRecordFor(null); setNewCompleted({ course_id: "", grade: "" }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Academic Record</DialogTitle>
            <DialogDescription>
              {recordFor?.full_name || recordFor?.email}{recordFor?.student_id ? ` · ${recordFor.student_id}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Completed courses</Label>
            {record?.completed.length === 0 && <p className="text-sm text-muted-foreground">None recorded yet.</p>}
            {record?.completed.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-2 text-sm">
                <span><Badge variant="outline" className="mr-2">{c.courses?.code}</Badge>{c.courses?.name}</span>
                <span className="flex items-center gap-2">
                  {c.grade && <Badge variant="secondary">{c.grade}</Badge>}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCompleted.mutate(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div className="flex-1 min-w-[180px] space-y-1">
              <Label className="text-xs">Add completed course</Label>
              <Select value={newCompleted.course_id} onValueChange={(v) => setNewCompleted((n) => ({ ...n, course_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select course..." /></SelectTrigger>
                <SelectContent>
                  {courses?.filter((c) => !completedIds.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Grade</Label>
              <Select value={newCompleted.grade} onValueChange={(v) => setNewCompleted((n) => ({ ...n, grade: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => addCompleted.mutate()} disabled={!newCompleted.course_id || addCompleted.isPending}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Current registrations</Label>
            {record?.registrations.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
            {record?.registrations.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span><Badge variant="outline" className="mr-2">{r.courses?.code}</Badge>{r.courses?.name}</span>
                <Badge variant={r.status === "registered" ? "default" : "secondary"} className="capitalize">{r.status}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
