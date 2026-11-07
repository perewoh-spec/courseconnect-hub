import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Calendar, Shield, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Index() {
  const features = [
    { icon: BookOpen, title: "Smart Registration", desc: "Automatic prerequisite validation prevents invalid enrollments" },
    { icon: Calendar, title: "Conflict-Free Scheduling", desc: "Real-time detection of schedule overlaps before you register" },
    { icon: Shield, title: "Secure & Reliable", desc: "Role-based access with verified authentication for all users" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <GraduationCap className="h-4 w-4" />
              Academic Registration Platform
            </div>
            <h1 className="font-heading text-4xl md:text-6xl font-bold tracking-tight mb-6">
              CourseConnect
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              A secure student registration & schedule management system with automated prerequisite validation and conflict-free scheduling.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-base">
                <Link to="/auth">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base">
                <Link to="/auth">Sign In</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="text-center p-6 rounded-2xl bg-card border">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-heading text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          CourseConnect — Student Registration System
        </div>
      </footer>
    </div>
  );
}
