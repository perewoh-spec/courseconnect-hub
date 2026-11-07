import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound";

// Pages are loaded on demand to keep the initial download small.
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const BrowseCourses = lazy(() => import("./pages/BrowseCourses"));
const MyRegistrations = lazy(() => import("./pages/MyRegistrations"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ManageCourses = lazy(() => import("./pages/admin/ManageCourses"));
const ManagePrerequisites = lazy(() => import("./pages/admin/ManagePrerequisites"));
const AdminRegistrations = lazy(() => import("./pages/admin/AdminRegistrations"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
);

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "student" }) {
  const { user, role, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to={role === "admin" ? "/admin" : "/dashboard"} replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
            <Route path="/auth" element={<Suspense fallback={<PageLoader />}><Auth /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
            <Route path="/courses" element={<ProtectedRoute requiredRole="student"><BrowseCourses /></ProtectedRoute>} />
            <Route path="/registrations" element={<ProtectedRoute requiredRole="student"><MyRegistrations /></ProtectedRoute>} />
            <Route path="/schedule" element={<ProtectedRoute requiredRole="student"><Schedule /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/courses" element={<ProtectedRoute requiredRole="admin"><ManageCourses /></ProtectedRoute>} />
            <Route path="/admin/prerequisites" element={<ProtectedRoute requiredRole="admin"><ManagePrerequisites /></ProtectedRoute>} />
            <Route path="/admin/registrations" element={<ProtectedRoute requiredRole="admin"><AdminRegistrations /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><ManageUsers /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
