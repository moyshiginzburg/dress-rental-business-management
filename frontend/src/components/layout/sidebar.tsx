"use client";

/**
 * Sidebar Navigation Component
 * 
 * Purpose: Main navigation sidebar for the admin dashboard.
 * Provides links to all management modules.
 * Supports callback for mobile menu closing.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Wallet,
  FileText,
  FileDown,
  ScrollText,
  LogOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

interface SidebarProps {
  onItemClick?: () => void;
}

const menuItems = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/dashboard/customers", label: "לקוחות", icon: Users },
  { href: "/dashboard/dresses", label: "שמלות", icon: ShoppingBag },
  { href: "/dashboard/transactions", label: "תזרים מזומנים", icon: Wallet },
  { href: "/dashboard/orders", label: "הזמנות", icon: FileText },
  { href: "/dashboard/agreements", label: "הסכמים", icon: ScrollText },
  { href: "/dashboard/export", label: "ייצוא נתונים", icon: FileDown },
];

export function Sidebar({ onItemClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    api.setToken(null);
    router.push("/login");
  };

  const handleItemClick = () => {
    // Call the callback to close the mobile menu when an item is clicked
    if (onItemClick) {
      onItemClick();
    }
  };

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-72 bg-white/95 backdrop-blur-md border-l shadow-2xl">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-24 flex-col justify-center gap-1 px-8 border-b bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
              <span className="text-2xl text-white">👗</span>
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-primary">ניהול עסק שמלות</h1>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">שמלות ערב</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 px-4 py-8">
          {menuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleItemClick}
                className={cn(
                  "flex items-center gap-4 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-primary/60")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-4 space-y-2 bg-muted/30">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut className="h-5 w-5 text-muted-foreground/60" />
            התנתקי
          </button>
        </div>
      </div>
    </aside>
  );
}
