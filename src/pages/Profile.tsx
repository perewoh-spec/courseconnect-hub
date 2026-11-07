import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/utils";
import { isDemoEmail } from "@/lib/demo";

export default function Profile() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) setFullName(profile.full_name);
  }, [profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("user_id", user!.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Profile saved" });
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.password });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } else {
      toast({ title: "Password changed" });
      setPasswords({ password: "", confirm: "" });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Your account details and password</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                {role === "student" && (
                  <div className="space-y-2">
                    <Label>Student ID</Label>
                    <Input value={profile?.student_id ?? ""} disabled placeholder="Not assigned yet" />
                    <p className="text-xs text-muted-foreground">Assigned by the registrar's office.</p>
                  </div>
                )}
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-heading text-lg">Change Password</CardTitle></CardHeader>
        <CardContent>
          {isDemoEmail(user?.email) ? (
            <p className="text-sm text-muted-foreground">Password changes are turned off for shared demo accounts.</p>
          ) : (
          <form onSubmit={changePassword} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input type="password" value={passwords.password} onChange={(e) => setPasswords((p) => ({ ...p, password: e.target.value }))} required minLength={6} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input type="password" value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} required minLength={6} autoComplete="new-password" />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={changingPassword}>
              {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
