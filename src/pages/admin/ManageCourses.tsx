import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { errorMessage, formatTime } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Course = Database["public"]["Tables"]["courses"]["Row"];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

interface CourseForm {
  code: string; name: string; description: string; credits: number;
  capacity: number; day_of_week: string; start_time: string; end_time: string;
  room: string; instructor: string; semester: string; is_active: boolean;
}

const emptyForm: CourseForm = {
  code: "", name: "", description: "", credits: 3, capacity: 30,
  day_of_week: "Monday", start_time: "09:00", end_time: "10:00",
  room: "", instructor: "", semester: "Fall 2026", is_active: true,
};

export default function ManageCourses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("code");
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (formatTime(form.end_time) <= formatTime(form.start_time)) {
        throw new Error("End time must be after start time");
      }
      if (editId) {
        const { error } = await supabase.from("courses").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      toast({ title: editId ? "Course updated" : "Course created" });
    },
    onError: (e) => toast({
      title: "Error",
      description: errorMessage(e).includes("courses_code_key") ? "A course with this code already exists." : errorMessage(e),
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: "Course deleted" });
    },
    onError: (e) => toast({ title: "Couldn't delete course", description: errorMessage(e), variant: "destructive" }),
  });

  // Deleting a course also removes its registrations and prerequisites, so confirm first.
  const confirmDelete = (course: Course) => {
    const warning = course.enrolled_count > 0
      ? `${course.enrolled_count} student(s) are registered and will lose this course. `
      : "";
    if (window.confirm(`Delete ${course.code}? ${warning}This can't be undone. To stop new registrations instead, edit the course and turn off "Open for registration".`)) {
      deleteMutation.mutate(course.id);
    }
  };

  const openEdit = (course: Course) => {
    setForm({
      code: course.code, name: course.name, description: course.description ?? "",
      credits: course.credits, capacity: course.capacity, day_of_week: course.day_of_week,
      start_time: formatTime(course.start_time), end_time: formatTime(course.end_time),
      room: course.room ?? "", instructor: course.instructor ?? "",
      semester: course.semester, is_active: course.is_active,
    });
    setEditId(course.id);
    setOpen(true);
  };

  const updateField = <K extends keyof CourseForm>(field: K, value: CourseForm[K]) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Manage Courses</h1>
          <p className="text-muted-foreground">Create, edit, and remove courses</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm); setEditId(null); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Course</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">{editId ? "Edit Course" : "New Course"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => updateField("code", e.target.value)} required placeholder="CS101" /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => updateField("name", e.target.value)} required placeholder="Intro to CS" /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Credits</Label><Input type="number" value={form.credits} onChange={(e) => updateField("credits", +e.target.value)} min={1} max={6} /></div>
                <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => updateField("capacity", +e.target.value)} min={1} /></div>
                <div>
                  <Label>Day</Label>
                  <Select value={form.day_of_week} onValueChange={(v) => updateField("day_of_week", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={(e) => updateField("start_time", e.target.value)} required /></div>
                <div><Label>End Time</Label><Input type="time" value={form.end_time} onChange={(e) => updateField("end_time", e.target.value)} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Room</Label><Input value={form.room} onChange={(e) => updateField("room", e.target.value)} placeholder="Room 301" /></div>
                <div><Label>Instructor</Label><Input value={form.instructor} onChange={(e) => updateField("instructor", e.target.value)} placeholder="Dr. Smith" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div><Label>Semester</Label><Input value={form.semester} onChange={(e) => updateField("semester", e.target.value)} required placeholder="Fall 2026" /></div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch checked={form.is_active} onCheckedChange={(v) => updateField("is_active", v)} />
                  Open for registration
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {editId ? "Update Course" : "Create Course"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {courses?.map((course) => (
          <Card key={course.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{course.code}</Badge>
                  <span className="font-medium">{course.name}</span>
                  <Badge variant="secondary">{course.credits} cr</Badge>
                  {!course.is_active && <Badge variant="outline">Closed</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {course.day_of_week} {formatTime(course.start_time)}–{formatTime(course.end_time)} · {course.room} · {course.instructor} · {course.semester} · {course.enrolled_count}/{course.capacity} enrolled
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEdit(course)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => confirmDelete(course)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
