"use client";

/**
 * Dashboard Layout
 * 
 * Purpose: Provides the layout structure for all dashboard pages.
 * Includes sidebar navigation and main content area.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, authApi } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalSearch } from "@/components/layout/global-search";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (!api.isAuthenticated()) {
        router.push("/login");
        return;
      }

      try {
        await authApi.verify();
        setLoading(false);
      } catch {
        api.setToken(null);
        router.push("/login");
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 px-4 flex items-center justify-between bg-white/80 backdrop-blur-md border-b z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm">👗</div>
          <span className="font-bold text-sm">ניהול עסק שמלות</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-6 w-6 text-primary" /> : <Menu className="h-6 w-6 text-primary" />}
        </Button>
      </div>

      {/* Global Search - visible on desktop */}
      <div className="hidden lg:block fixed top-4 left-4 z-50">
        <GlobalSearch />
      </div>

      {/* Sidebar - hidden on mobile unless open */}
      <div className={`
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        transition-transform duration-300 ease-in-out
        fixed inset-y-0 right-0 z-50 w-72 lg:block
      `}>
        <Sidebar onItemClick={() => setSidebarOpen(false)} />
      </div>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:mr-72 min-h-screen pt-20 lg:pt-6 pb-20 lg:pb-6">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl">
          {children}
        </div>
      </main>

    </div>
  );
}
