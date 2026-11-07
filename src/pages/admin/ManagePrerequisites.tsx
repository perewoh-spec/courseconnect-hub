import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { errorMessage } from "@/lib/utils";

type CourseRef = { code: string; name: string } | null;

export default function ManagePrerequisites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [prereqId, setPrereqId] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("code");
      return data ?? [];
    },
  });

  const { data: prerequisites } = useQuery({
    queryKey: ["prerequisites"],
    queryFn: async () => {
      const { data } = await supabase.from("prerequisites").select("*, course:courses!prerequisites_course_id_fkey(code, name), prereq:courses!prerequisites_prerequisite_course_id_fkey(code, name)");
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("prerequisites").insert({ course_id: courseId, prerequisite_course_id: prereqId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prerequisites"] });
      setCourseId("");
      setPrereqId("");
      toast({ title: "Prerequisite added" });
    },
    onError: (e) => toast({
      title: "Couldn't add prerequisite",
      description: errorMessage(e).includes("prerequisites_course_id_prerequisite_course_id_key") ? "This prerequisite already exists." : errorMessage(e),
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prerequisites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prerequisites"] });
      toast({ title: "Prerequisite removed" });
    },
    onError: (e) => toast({ title: "Error", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Manage Prerequisites</h1>
        <p className="text-muted-foreground">Define course dependency relationships</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label>Prerequisite Course (must complete first)</Label>
              <Select value={prereqId} onValueChange={setPrereqId}>
                <SelectTrigger><SelectValue placeholder="Select prerequisite..." /></SelectTrigger>
                <SelectContent>{courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
            <div className="flex-1 min-w-[200px]">
              <Label>Course (requires prerequisite)</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue placeholder="Select course..." /></SelectTrigger>
                <SelectContent>{courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={!courseId || !prereqId || courseId === prereqId}>
              <Plus className="h-4 w-4 mr-2" />Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {prerequisites?.map((p) => {
          const course = p.course as CourseRef;
          const prereq = p.prereq as CourseRef;
          return (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{prereq?.code}</Badge>
                  <span className="text-sm text-muted-foreground">{prereq?.name}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{course?.code}</Badge>
                  <span className="text-sm text-muted-foreground">{course?.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {prerequisites?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No prerequisites defined yet.</div>
        )}
      </div>
    </div>
  );
}
