"use client";

/**
 * Dashboard Main Page
 * 
 * Purpose: Display business overview with extreme clarity and beauty.
 * Focuses on quick actions and key metrics.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
interface DashboardData {
  financials: {
    monthly: { income: number; expenses: number; profit: number };
    yearly: { income: number; expenses: number; profit: number };
  };
  orders: { active: number };
  customers: { total: number; newThisMonth: number };
  dresses: { available: number; total: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const summaryRes = await dashboardApi.summary();

        if (summaryRes.success && summaryRes.data) {
          setData(summaryRes.data as DashboardData);
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">👗</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">לא ניתן לטעון את הנתונים</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">לוח בקרה</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">שלום, <span className="text-green-600">ברוך הבא</span></h1>
        </div>
      </div>

      {/* Primary Quick Actions - The Heart of the App */}
      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/dashboard/orders/new"
          className="group relative overflow-hidden bg-green-600 p-6 rounded-[2rem] shadow-xl shadow-green-600/20 transition-all active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <ShoppingBag className="h-24 w-24 text-white" />
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
              <PlusCircle className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">הזמנה חדשה</h3>
              <p className="text-white/80 text-sm">השכרה או תפירה חדשה</p>
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/dashboard/transactions/new?type=income"
            className="bg-green-600 p-5 rounded-[2rem] shadow-lg shadow-green-600/20 flex flex-col gap-3 active:scale-[0.98] transition-all"
          >
            <div className="bg-white/20 w-fit p-2 rounded-xl">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">הכנסה</h3>
              <p className="text-white/70 text-xs">תיעוד תשלום</p>
            </div>
          </Link>

          <Link
            href="/dashboard/transactions/new?type=expense"
            className="bg-red-600 p-5 rounded-[2rem] shadow-lg shadow-red-600/20 flex flex-col gap-3 active:scale-[0.98] transition-all"
          >
            <div className="bg-white/20 w-fit p-2 rounded-xl">
              <TrendingDown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">הוצאה</h3>
              <p className="text-white/70 text-xs">תיעוד הוצאה</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-[1.5rem] border-none shadow-sm bg-white/50">
          <CardContent className="p-5">
            <p className="text-xs font-bold text-muted-foreground mb-1 uppercase">הכנסות החודש</p>
            <div className="text-xl font-black text-green-600">
              {formatCurrency(data.financials.monthly.income)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="rounded-[1.5rem] border-none shadow-sm bg-white/50">
          <CardContent className="p-5">
            <p className="text-xs font-bold text-muted-foreground mb-1 uppercase">הזמנות פעילות</p>
            <div className="text-xl font-black text-green-600">
              {data.orders.active}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-none shadow-sm bg-white/50">
          <CardContent className="p-5">
            <p className="text-xs font-bold text-muted-foreground mb-1 uppercase">שמלות פעילות</p>
            <div className="text-xl font-black">
              {data.dresses.available} <span className="text-xs font-normal text-muted-foreground">/ {data.dresses.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] border-none shadow-sm bg-white/50">
          <CardContent className="p-5">
            <p className="text-xs font-bold text-muted-foreground mb-1 uppercase">לקוחות</p>
            <div className="text-xl font-black">
              {data.customers.total}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
