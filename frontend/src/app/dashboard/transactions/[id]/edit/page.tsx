"use client";

/**
 * Edit Transaction Page
 * 
 * Purpose: A dedicated page for editing existing income/expenses.
 * Optimized for full-screen usage on both desktop and mobile.
 * Language: Feminine.
 */

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowRight, 
  Calendar, 
  CreditCard, 
  Camera, 
  X, 
  ShoppingBag,
  Plus,
  Search,
  Check,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { transactionsApi, customersApi, ordersApi } from "@/lib/api";
import { cn, getCategoryLabel } from "@/lib/utils";

const FORM_INCOME_CATEGORIES = [
  { value: "existing_order", label: "הזמנה" },
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

const PAYMENT_METHODS = [
  { value: "cash", label: "מזומן" },
  { value: "bit", label: "ביט" },
  { value: "paybox", label: "פייבוקס" },
  { value: "credit", label: "אשראי" },
  { value: "transfer", label: "העברה" },
  { value: "check", label: "צ'ק" },
];

export default function EditTransactionPage() {
  const router = useRouter();
  const params = useParams();
  const transactionId = params.id as string;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [type, setType] = useState<"income" | "expense">("income");
  const [uiCategory, setUiCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [fileBase64, setFileBase64] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<{ id: number; name: string; phone: string }[]>([]);
  
  const [orderId, setOrderId] = useState("");
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [expenseAllocation, setExpenseAllocation] = useState<"business" | "customer" | "split">("business");
  const [customerChargeAmount, setCustomerChargeAmount] = useState("");
  
  const [supplier, setSupplier] = useState("");
  const [product, setProduct] = useState("");
  
  // Payment Details State
  const [bankNumber, setBankNumber] = useState("");
  const [branchNumber, setBranchNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [installments, setInstallments] = useState("1");

  useEffect(() => {
    const loadTransaction = async () => {
      try {
        const res = await transactionsApi.get(parseInt(transactionId));
        if (res.success && res.data) {
          const t = (res.data as any).transaction; // Corrected access to .transaction
          if (!t) throw new Error("Transaction not found");
          
          setType(t.type);
          setAmount(t.amount.toString());
          setCategory(t.category);
          setDate(t.date?.split("T")[0] || "");
          setPaymentMethod(t.payment_method || "cash");
          setNotes(t.notes || "");
          setCustomerId(t.customer_id?.toString() || "");
          setCustomerSearch(t.customer_name || "");
          setOrderId(t.order_id?.toString() || "");
          
          if (t.supplier) setSupplier(t.supplier);
          if (t.product) setProduct(t.product);
          if (t.check_number) setCheckNumber(t.check_number);
          if (t.confirmation_number) setConfirmationNumber(t.confirmation_number);
          if (t.last_four_digits) setLastFourDigits(t.last_four_digits);
          if (t.installments) setInstallments(t.installments.toString());
          if (t.bank_details) {
            try {
              const bankData = JSON.parse(t.bank_details);
              setBankNumber(bankData.bank || "");
              setBranchNumber(bankData.branch || "");
              setAccountNumber(bankData.account || "");
            } catch (e) {}
          }
          
          if (t.type === "income") {
            if (t.order_id) setUiCategory("existing_order");
            else if (t.category === "repair") setUiCategory("repair");
            else setUiCategory("other");
          } else {
            if (t.customer_charge_amount > 0) {
              if (t.customer_charge_amount === t.amount) setExpenseAllocation("customer");
              else {
                setExpenseAllocation("split");
                setCustomerChargeAmount(t.customer_charge_amount.toString());
              }
            } else {
              setExpenseAllocation("business");
            }
          }
        }
      } catch (e) {
        console.error("Error loading transaction:", e);
        toast({ title: "שגיאה", description: "לא ניתן לטעון את העסקה", variant: "destructive" });
        router.push("/dashboard/transactions");
      } finally {
        setLoading(false);
      }
    };
    loadTransaction();
  }, [transactionId, toast, router]);

  useEffect(() => {
    const loadData = async () => {
      if (type === "income" && uiCategory === "existing_order") {
        const res = await ordersApi.list({ limit: 10 } as any);
        if (res.success) setRecentOrders((res.data as any).orders || []);
      } else if (type === "expense" && (expenseAllocation === "customer" || expenseAllocation === "split")) {
        const res = await ordersApi.list({ limit: 10 } as any);
        if (res.success) setRecentOrders((res.data as any).orders || []);
      }
    };
    if (!loading) loadData();
  }, [type, uiCategory, expenseAllocation, loading]);

  useEffect(() => {
    if (customerSearch.length > 1) {
      const timer = setTimeout(async () => {
        try {
          const res = await customersApi.list({ search: customerSearch, limit: 1000 });
          if (res.success && res.data) {
            setCustomers((res.data as any).customers);
          }
        } catch (e) {
          console.error(e);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [customerSearch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { 
        toast({ title: "שגיאה", description: "הקובץ גדול מדי", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFileBase64(base64String.split(',')[1]);
        setFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || (!category && type === "expense") || (type === "income" && !uiCategory)) {
      toast({ title: "חסרים פרטים", description: "נא למלא את כל שדות החובה", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const data: any = {
        type,
        amount: parseFloat(amount),
        category,
        date,
        supplier: type === "expense" ? supplier : undefined,
        product: type === "expense" ? product : undefined,
        payment_method: paymentMethod || undefined,
        notes: notes || undefined,
        confirmation_number: confirmationNumber || undefined,
        check_number: checkNumber || undefined,
        last_four_digits: lastFourDigits || undefined,
        installments: installments ? parseInt(installments) : 1,
        bank_details: (bankNumber || branchNumber || accountNumber) ? 
          JSON.stringify({ bank: bankNumber, branch: branchNumber, account: accountNumber }) : undefined,
        customer_id: customerId ? parseInt(customerId) : undefined,
        order_id: orderId ? parseInt(orderId) : undefined,
        fileBase64,
        fileName,
        customer_charge_amount: type === 'expense' && expenseAllocation !== 'business'
          ? (expenseAllocation === 'customer' ? parseFloat(amount) : parseFloat(customerChargeAmount || '0'))
          : 0,
      };

      await transactionsApi.update(parseInt(transactionId), data);
      toast({ title: "הצלחה!", description: "העסקה עודכנה בהצלחה" });
      router.push("/dashboard/transactions");
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן לעדכן את העסקה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">טוען...</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-md border-b px-4 py-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowRight className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-black">עריכת תנועה</h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 sm:p-6 space-y-8">
        
        {/* Type Info (Non-editable for safety) */}
        <div className="bg-muted p-4 rounded-2xl flex items-center justify-center gap-2">
           <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">סוג התנועה:</span>
           <span className={cn("font-black px-4 py-1 rounded-full text-white", type === 'income' ? 'bg-green-600' : 'bg-red-600')}>
             {type === 'income' ? 'הכנסה' : 'הוצאה'}
           </span>
        </div>

        {/* Amount Input */}
        <div className="text-center py-4">
          <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2 block">סכום בשקלים</label>
          <div className="relative inline-block w-full max-w-[240px]">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-6xl font-black text-center bg-transparent border-none focus:outline-none w-full placeholder:text-muted/20"
            />
            <span className="absolute -right-6 top-2 text-3xl text-muted-foreground font-light">₪</span>
          </div>
        </div>

        {/* Date & Payment Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> תאריך
            </label>
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="h-12 rounded-xl border-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> אמצעי תשלום
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full h-12 rounded-xl border-2 bg-background px-3 font-bold"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Income Flow */}
        {type === "income" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">מה סוג ההכנסה? *</label>
              <div className="grid grid-cols-3 gap-2">
                {FORM_INCOME_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setUiCategory(cat.value);
                      if (cat.value === 'repair' || cat.value === 'other') setCategory(cat.value);
                      else setCategory("");
                      setOrderId("");
                      setCustomerId("");
                    }}
                    className={cn(
                      "py-3 px-1 text-xs font-bold rounded-xl border-2 transition-all",
                      uiCategory === cat.value ? "bg-primary text-white border-primary shadow-lg" : "bg-background hover:bg-muted"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {uiCategory === "existing_order" && !orderId && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-bold text-primary flex items-center gap-1"><Search className="h-3 w-3" /> בחרי הזמנה</label>
                <div className="grid gap-2 max-h-60 overflow-y-auto p-1 bg-muted/20 rounded-2xl border-2">
                  {recentOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => {
                        setOrderId(order.id.toString());
                        setCustomerId(order.customer_id.toString());
                        setCategory('order');
                        setCustomerSearch(order.customer_name);
                      }}
                      className="w-full text-right p-4 bg-card border-2 rounded-xl hover:border-primary transition-all shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-black text-primary">{order.customer_name}</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">#{order.id}</span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-muted-foreground">{order.order_summary || 'הזמנה'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {orderId && (
              <Card className="border-2 border-primary/20 bg-primary/5 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in zoom-in-95">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-full"><ShoppingBag className="h-6 w-6 text-primary" /></div>
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">משוייך להזמנה #{orderId}</p>
                    <p className="text-lg font-black">{customerSearch}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => { setOrderId(""); setCategory(""); }} className="text-destructive"><X /></Button>
              </Card>
            )}

            {(uiCategory === "repair" || uiCategory === "other") && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">מי הלקוחה?</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חפשי לקוחה..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pr-10 h-12 rounded-xl border-2"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {customers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCustomerId(c.id.toString()); setCustomerSearch(c.name); }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border-2 text-right transition-all",
                        customerId === c.id.toString() ? "border-primary bg-primary/5" : "border-transparent bg-muted/30"
                      )}
                    >
                      <span className="font-bold">{c.name}</span>
                      {customerId === c.id.toString() && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expense Flow */}
        {type === "expense" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ספק / חנות</label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="איפה קנית?"
                  className="focus:border-red-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">מוצר / שירות</label>
                <Input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="מה קנית?"
                  className="focus:border-red-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">קטגוריה *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-12 rounded-xl border-2 bg-background px-3 font-bold"
              >
                <option value="">בחרי קטגוריה...</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div className="bg-muted p-1.5 rounded-2xl flex gap-1">
              {[
                { id: "business", label: "עסקית" },
                { id: "customer", label: "לקוחה" },
                { id: "split", label: "משולב" }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpenseAllocation(opt.id as any)}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                    expenseAllocation === opt.id ? "bg-white shadow text-primary" : "text-muted-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {expenseAllocation !== "business" && (
              <Card className="border-2 border-red-100 bg-red-50/30 p-4 rounded-2xl space-y-4">
                <label className="text-xs font-bold text-red-700 uppercase">שיוך לחיוב</label>
                {!orderId ? (
                  <div className="grid gap-2 max-h-40 overflow-y-auto">
                    {recentOrders.slice(0, 5).map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => { setOrderId(o.id.toString()); setCustomerId(o.customer_id.toString()); setCustomerSearch(o.customer_name); }}
                        className="p-3 bg-white border-2 rounded-xl text-right hover:border-red-300 transition-all"
                      >
                        <p className="font-bold text-red-600 text-sm">{o.customer_name}</p>
                        <p className="text-[10px] text-muted-foreground">הזמנה #{o.id}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-3 rounded-xl border-2 border-red-200 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-red-600">הזמנה #{orderId}</p>
                      <p className="font-bold">{customerSearch}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setOrderId("")} className="text-red-600"><X /></Button>
                  </div>
                )}
                {expenseAllocation === "split" && (
                  <Input
                    type="number"
                    value={customerChargeAmount}
                    onChange={(e) => setCustomerChargeAmount(e.target.value)}
                    placeholder="כמה היא משלמת?"
                    className="h-11 rounded-xl border-2"
                  />
                )}
              </Card>
            )}
          </div>
        )}

        {/* Global Fields */}
        <section className="space-y-4">
          
          {/* Payment Details - Conditional Fields */}
          {type === "income" && paymentMethod === "credit" && (
            <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">אסמכתא</label>
                <Input value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} placeholder="אישור..." className="h-10 text-center" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">4 ספרות</label>
                <Input 
                  value={lastFourDigits} 
                  onChange={(e) => setLastFourDigits(e.target.value)} 
                  placeholder="****" 
                  maxLength={4}
                  className="h-10 text-center" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">תשלומים</label>
                <Input 
                  type="number" 
                  min="1"
                  value={installments} 
                  onChange={(e) => setInstallments(e.target.value)} 
                  className="h-10 text-center" 
                />
              </div>
            </div>
          )}

          {type === "income" && (paymentMethod === "bit" || paymentMethod === "paybox" || paymentMethod === "transfer") && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">אסמכתא</label>
              <Input value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} placeholder="מספר אישור..." className="h-10" />
            </div>
          )}

          {type === "income" && paymentMethod === "transfer" && (
            <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' בנק</label>
                <Input value={bankNumber} onChange={(e) => setBankNumber(e.target.value)} className="h-10 text-center" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' סניף</label>
                <Input value={branchNumber} onChange={(e) => setBranchNumber(e.target.value)} className="h-10 text-center" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' חשבון</label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="h-10 text-center" />
              </div>
            </div>
          )}

          {type === "income" && paymentMethod === "check" && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">מספר צ'ק</label>
                <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="h-10" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' בנק</label>
                  <Input value={bankNumber} onChange={(e) => setBankNumber(e.target.value)} className="h-10 text-center" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' סניף</label>
                  <Input value={branchNumber} onChange={(e) => setBranchNumber(e.target.value)} className="h-10 text-center" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">מס' חשבון</label>
                  <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="h-10 text-center" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="פרטים נוספים..."
              className="w-full h-32 p-4 rounded-2xl border-2 bg-background focus:border-primary outline-none resize-none shadow-inner"
            />
          </div>

          {/* File upload: always visible for expenses (receipt), hidden for cash income */}
          {(type === "expense" || paymentMethod !== "cash") && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-widest">
                <Camera className="h-3 w-3" /> {type === "expense" ? "צילום קבלה" : "אסמכתא / צילום"}
              </label>
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed transition-all cursor-pointer",
                fileName ? "bg-green-50 border-green-300 text-green-700" : "bg-muted/20 hover:bg-muted/40 text-muted-foreground"
              )}>
                {fileName ? <Check className="h-8 w-8 mb-2" /> : <Upload className="h-8 w-8 mb-2" />}
                <span className="font-bold text-sm">{fileName || "לחצי להעלאת קובץ או צילום"}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          )}
        </section>

      </form>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t z-40">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1 h-14 rounded-2xl text-lg font-bold border-2"
            onClick={() => router.back()}
          >
            ביטול
          </Button>
          <Button 
            className={cn(
              "flex-[2] h-14 rounded-2xl text-lg font-bold shadow-xl transition-all",
              type === "income" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            )}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "מעדכן..." : "שמרי שינויים 🎉"}
          </Button>
        </div>
      </div>
    </div>
  );
}
