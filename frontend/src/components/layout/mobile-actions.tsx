"use client";

/**
 * Mobile Actions Component
 * 
 * Purpose: Provides quick access to the most frequent business actions (Order, Income, Expense).
 * Positioned at the bottom of the screen on mobile devices.
 * Language: Feminine.
 * Note: Using standard <a> tags instead of Next.js <Link> to force a clean navigation
 * and bypass any potential client-side routing cache issues.
 */

import { TrendingUp, TrendingDown, ShoppingBag } from "lucide-react";

export function MobileActions() {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 bg-gradient-to-t from-background via-background to-transparent animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center justify-around gap-2 bg-white/90 backdrop-blur-lg border border-green-600/10 rounded-3xl p-2 shadow-2xl shadow-green-600/20">
        <a
          href="/dashboard/transactions/new?type=expense"
          className="flex flex-col items-center justify-center flex-1 py-2 gap-1 text-red-600 active:scale-95 transition-transform"
        >
          <div className="bg-red-50 p-2 rounded-2xl">
            <TrendingDown className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold">הוצאה</span>
        </a>

        <a
          href="/dashboard/orders/new"
          className="flex flex-col items-center justify-center flex-[1.5] py-3 gap-1 bg-green-600 text-white rounded-2xl shadow-lg shadow-green-600/30 active:scale-95 transition-all -translate-y-4 border-4 border-background"
        >
          <ShoppingBag className="h-7 w-7" />
          <span className="text-xs font-bold">הזמנה חדשה</span>
        </a>

        <a
          href="/dashboard/transactions/new?type=income"
          className="flex flex-col items-center justify-center flex-1 py-2 gap-1 text-green-600 active:scale-95 transition-transform"
        >
          <div className="bg-green-50 p-2 rounded-2xl">
            <TrendingUp className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold">הכנסה</span>
        </a>
      </div>
    </div>
  );
}