import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDemoEmail } from "@/lib/demo";

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, user } = useAuth();
  const isDemo = isDemoEmail(user?.email);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-3">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-heading font-semibold text-lg">CourseConnect</span>
            </div>
            {role && (
              <Badge variant={role === "admin" ? "default" : "secondary"} className="ml-auto capitalize">
                {role}
              </Badge>
            )}
          </header>
          {isDemo && (
            <div className="border-b bg-accent/10 px-4 py-1.5 text-center text-xs text-foreground">
              <strong>Demo mode:</strong> everything here is placeholder data, and no real accounts or records are shown. This account is
              shared, so other visitors can see your changes. Sign out to try another role.
            </div>
          )}
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
