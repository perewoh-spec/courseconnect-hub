import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_ACCOUNTS, DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo";

export default function Auth() {
  const { user, role, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to={role === "admin" ? "/admin" : "/dashboard"} replace />;

  const signInDemo = async (email: string) => {
    setDemoLoading(email);
    const { error } = await signIn(email, DEMO_PASSWORD);
    setDemoLoading(null);
    if (error) toast({ title: "Demo unavailable", description: error.message, variant: "destructive" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
        });
        if (error) toast({ title: "Couldn't send reset email", description: error.message, variant: "destructive" });
        else {
          toast({ title: "Check your email", description: "We sent you a link to reset your password." });
          setForgot(false);
        }
      } else if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) toast({ title: "Login failed", description: error.message, variant: "destructive" });
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
        else {
          toast({ title: "Account created!", description: "Check your email to confirm your account, then sign in." });
          setIsLogin(true);
          setPassword("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold">CourseConnect</h1>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-xl">{forgot ? "Reset Password" : isLogin ? "Welcome Back" : "Create Account"}</CardTitle>
            <CardDescription>
              {forgot
                ? "Enter your email and we'll send you a reset link"
                : isLogin ? "Sign in to access your courses" : "Register to start enrolling in courses"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && !forgot && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Your full name" autoComplete="name" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@university.edu" autoComplete="email" />
              </div>
              {!forgot && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <button type="button" onClick={() => setForgot(true)} className="text-xs text-primary hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••"
                    autoComplete={isLogin ? "current-password" : "new-password"} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {forgot ? "Send Reset Link" : isLogin ? "Sign In" : "Sign Up"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {forgot ? (
                <button type="button" onClick={() => setForgot(false)} className="text-primary hover:underline font-medium">
                  Back to sign in
                </button>
              ) : (
                <>
                  {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                  <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
                    {isLogin ? "Sign up" : "Sign in"}
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {DEMO_MODE && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">Try the demo</CardTitle>
              <CardDescription>
                See each side of the system with a sample account. The demo only shows placeholder data (made-up courses
                and students), kept completely separate from real accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((a) => (
                <Button
                  key={a.email}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                  disabled={!!demoLoading}
                  onClick={() => signInDemo(a.email)}
                >
                  <span className="flex items-center font-semibold">
                    {demoLoading === a.email && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {a.label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{a.description}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
