"use client";

/**
 * Transactions Management Page
 * 
 * Purpose: Display and manage income and expense transactions.
 * Shows financial records with filtering and summary statistics.
 * Language: Feminine.
 * Terms: Updated 'first_rental' to 'sewing_for_rental'.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useRouter } from "next/navigation";
import { transactionsApi, customersApi } from "@/lib/api";
import {
  formatCurrency,
  formatDateShort,
  getCategoryLabel,
  getPaymentMethodLabel,
  cn,
} from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  Search,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface Transaction {
  id: number;
  date: string;
  type: "income" | "expense";
  category: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_full_name: string | null;
  supplier: string | null;
  product: string | null;
  amount: number;
  payment_method: string | null;
  notes: string | null;
  order_id: number | null;
  order_summary: string | null;
  customer_charge_amount: number | null;
  items_breakdown: string | null; // Added: "type:price,type:price"
  order_total_price: number | null; // Added
}

const INCOME_CATEGORIES = [
  { value: "order", label: "הזמנה" },
  { value: "repair", label: "תיקונים" },
  { value: "other", label: "אחר" },
];

const EXPENSE_CATEGORIES = [
  { value: "materials", label: "חומרים" },
  { value: "overhead", label: "תקורה" },
  { value: "tax", label: "מיסוי" },
  { value: "equipment", label: "ציוד" },
  { value: "salary", label: "משכורות" },
  { value: "other", label: "אחר" },
];

export default function TransactionsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 500;

  // Customer Filter
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (customerSearch.length > 1 && !customerId) {
      const timer = setTimeout(async () => {
        try {
          const res = await customersApi.list({ search: customerSearch, limit: 5 });
          if (res.success && res.data) {
            setCustomers((res.data as any).customers);
          }
        } catch (e) {
          console.error(e);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setCustomers([]);
    }
  }, [customerSearch, customerId]);

  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    profit: 0,
  });

  const calculateDisplayAmount = useCallback((t: Transaction) => {
    // Logic: If no categories selected or 'rental' is selected, show full amount
    if (selectedCategories.length === 0 || selectedCategories.includes("rental")) {
      return t.amount;
    }

    // If it's an expense or not linked to an order, show full amount (filtered by DB anyway)
    if (t.type === "expense" || !t.order_id || !t.items_breakdown || !t.order_total_price) {
      return t.amount;
    }

    // Calculate relative amount for income from orders
    try {
      const items = t.items_breakdown.split(',').map(item => {
        const [type, price] = item.split(':');
        return { type, price: parseFloat(price) };
      });

      const matchedItemsPrice = items
        .filter(item => selectedCategories.includes(item.type))
        .reduce((sum, item) => sum + item.price, 0);

      if (matchedItemsPrice === 0) return 0;

      const ratio = matchedItemsPrice / t.order_total_price;
      return t.amount * ratio;
    } catch (e) {
      return t.amount;
    }
  }, [selectedCategories]);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await transactionsApi.list({
        type: typeFilter || undefined,
        category: selectedCategories.length > 0 ? selectedCategories.join(',') : undefined,
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined,
        customer_id: customerId || undefined,
        limit: 100000, // Fetch all to calculate accurate profit summary
      });
      if (response.success && response.data) {
        const data = response.data as { transactions: Transaction[] };

        // Apply the relative amount calculation to the transactions
        const processedTransactions = data.transactions.map(t => ({
          ...t,
          displayAmount: calculateDisplayAmount(t)
        })).filter(t => (t as any).displayAmount !== 0);

        setTransactions(processedTransactions as any);

        const income = processedTransactions
          .filter((t) => t.type === "income")
          .reduce((sum, t) => sum + (t as any).displayAmount, 0);
        const expenses = processedTransactions
          .filter((t) => t.type === "expense")
          .reduce((sum, t) => sum + (t as any).displayAmount, 0);

        setSummary({
          totalIncome: income,
          totalExpenses: expenses,
          profit: income - expenses,
        });
      }
    } catch (error) {
      console.error("Failed to load transactions:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון את העסקאות",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, selectedCategories, dateFrom, dateTo, customerId, toast, calculateDisplayAmount]);

  useEffect(() => {
    setCurrentPage(1); // Reset page on filter change
    fetchTransactions();
  }, [fetchTransactions]);

  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDelete = async (transaction: Transaction) => {
    if (!confirm("האם לבטל את העסקה?")) return;

    try {
      await transactionsApi.delete(transaction.id);
      toast({ title: "הצלחה", description: "עסקה נמחקה בהצלחה" });
      fetchTransactions();
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה במחיקת עסקה",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            תזרים מזומנים
          </h1>
          <p className="text-muted-foreground">{transactions.length} עסקאות</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => router.push('/dashboard/transactions/new?type=income')}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <TrendingUp className="h-4 w-4" />
            הכנסה
          </Button>
          <Button
            onClick={() => router.push('/dashboard/transactions/new?type=expense')}
            variant="destructive"
            className="gap-2"
          >
            <TrendingDown className="h-4 w-4" />
            הוצאה
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">הכנסות</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary.totalIncome)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">הוצאות</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(summary.totalExpenses)}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">רווח</p>
                <p
                  className={`text-2xl font-bold ${summary.profit >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                >
                  {formatCurrency(summary.profit)}
                </p>
              </div>
              <Wallet className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="סינון לפי לקוחה..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (e.target.value === "") setCustomerId(null);
                }}
                className="w-full h-10 pr-9 pl-3 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {customerId && (
                <button
                  onClick={() => {
                    setCustomerId(null);
                    setCustomerSearch("");
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {customers.length > 0 && !customerId && (
              <div className="absolute top-full right-0 w-full mt-1 bg-popover border rounded-md shadow-md z-50 overflow-hidden">
                {customers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch(c.name);
                      setCustomers([]);
                    }}
                    className="w-full text-right px-3 py-2 hover:bg-muted text-sm font-medium"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 px-3 border rounded-md bg-background"
            >
              <option value="">כל הסוגים</option>
              <option value="income">הכנסות</option>
              <option value="expense">הוצאות</option>
            </select>

            <div className="flex flex-wrap gap-2 p-1 bg-muted/30 rounded-lg">
              {[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
                .filter((cat, index, self) => self.findIndex(c => c.value === cat.value) === index)
                .map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setSelectedCategories(prev =>
                        prev.includes(cat.value)
                          ? prev.filter(v => v !== cat.value)
                          : [...prev, cat.value]
                      );
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-full border transition-all",
                      selectedCategories.includes(cat.value)
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-background text-muted-foreground border-input hover:border-primary/50"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              {selectedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories([])}
                  className="px-2 py-1.5 text-xs font-bold text-destructive hover:underline"
                >
                  ניקוי
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3">תאריך</th>
                  <th className="text-right p-3">סוג</th>
                  <th className="text-right p-3">קטגוריה</th>
                  <th className="text-right p-3">פרטים</th>
                  <th className="text-right p-3">סכום</th>
                  <th className="text-right p-3">תשלום</th>
                  <th className="text-right p-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((transaction) => {
                  const displayAmt = (transaction as any).displayAmount ?? transaction.amount;
                  const isPartial = displayAmt !== transaction.amount;

                  return (
                    <tr key={transaction.id} className="border-b table-row-hover">
                      <td className="p-3">{formatDateShort(transaction.date)}</td>
                      <td className="p-3">
                        {transaction.type === "income" ? (
                          <span className="badge badge-success">הכנסה</span>
                        ) : (
                          <span className="badge badge-error">הוצאה</span>
                        )}
                      </td>
                      <td className="p-3">{getCategoryLabel(transaction.category)}</td>
                      <td className="p-3">
                        {transaction.customer_name ||
                          transaction.customer_full_name ||
                          transaction.supplier ||
                          "-"}
                        {transaction.order_id && (
                          <span className="text-[10px] text-muted-foreground mr-1">
                            (הזמנה #{transaction.order_id})
                          </span>
                        )}
                      </td>
                      <td
                        className={`p-3 font-medium ${transaction.type === "income" ? "text-green-600" : "text-red-600"
                          }`}
                      >
                        <div className="flex flex-col">
                          <span>
                            {transaction.type === "income" ? "+" : "-"}
                            {formatCurrency(displayAmt)}
                          </span>
                          {isPartial && (
                            <span className="text-[9px] text-muted-foreground">
                              מתוך {formatCurrency(transaction.amount)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {transaction.payment_method
                          ? getPaymentMethodLabel(transaction.payment_method)
                          : "-"}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/dashboard/transactions/${transaction.id}/edit`)}
                            title="עריכת תנועה"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(transaction)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-muted pt-4 px-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="gap-1"
          >
            <ChevronRight className="h-4 w-4" /> הקודם
          </Button>
          <div className="text-sm text-muted-foreground font-medium">
            עמוד {currentPage} מתוך {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="gap-1"
          >
            הבא <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {
        transactions.length === 0 && !loading && (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">אין עסקאות להצגה</p>
          </div>
        )
      }
    </div>
  );
}
