import { BookOpen, Calendar, GraduationCap, Home, LogOut, ClipboardList, GitBranch, UserCog, UserCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const studentItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Browse Courses", url: "/courses", icon: BookOpen },
  { title: "My Registrations", url: "/registrations", icon: ClipboardList },
  { title: "My Schedule", url: "/schedule", icon: Calendar },
  { title: "My Profile", url: "/profile", icon: UserCircle },
];

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: Home },
  { title: "Manage Courses", url: "/admin/courses", icon: BookOpen },
  { title: "Prerequisites", url: "/admin/prerequisites", icon: GitBranch },
  { title: "Registrations", url: "/admin/registrations", icon: ClipboardList },
  { title: "Users", url: "/admin/users", icon: UserCog },
  { title: "My Profile", url: "/profile", icon: UserCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, signOut, user } = useAuth();

  const items = role === "admin" ? adminItems : studentItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-heading text-xs uppercase tracking-wider">
            {!collapsed && (
              <span className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                CourseConnect
              </span>
            )}
            {collapsed && <GraduationCap className="h-4 w-4" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard" || item.url === "/admin"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="mb-2 text-xs text-sidebar-foreground/60 truncate">
            {user?.email}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
