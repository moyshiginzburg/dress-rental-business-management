"use client";

/**
 * New Order Page
 * 
 * Purpose: A comprehensive page for creating new orders.
 * Replaces the old modal-based system. Optimized for both desktop and mobile.
 * Features: Multiple items per order, deposit payments with receipts, customer search/creation.
 * Language: Feminine.
 * Terms: Updated 'first_rental' to 'sewing_for_rental'.
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  ArrowRight, 
  User, 
  ShoppingBag, 
  Calendar, 
  Plus, 
  X, 
  Upload, 
  Check, 
  Search,
  CreditCard,
  Trash2,
  Link2,
  Copy,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { customersApi, dressesApi, ordersApi, agreementsApi } from "@/lib/api";
import { cn, formatCurrency, formatDateShort, normalizePhoneInput } from "@/lib/utils";
import { DressSelector } from "@/components/dashboard/dress-selector";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { clearSharedUploadPayload, getSharedUploadPayload } from "@/lib/shared-upload";

const ORDER_TYPES = [
  { value: "rental", label: "השכרה" },
  { value: "sewing_for_rental", label: "תפירה שנשארת בהשכרה" },
  { value: "sewing", label: "תפירה" },
  { value: "sale", label: "מכירה" },
];

interface OrderItem {
  dress_id: string;
  dress_name: string;
  item_type: string;
  base_price: string;
  additional_payments: string; 
  wearer_name: string;
  notes: string;
}

interface DepositPayment {
  amount: string;
  method: string;
  notes?: string;
  confirmation_number?: string;
  last_four_digits?: string;
  installments?: string;
  fileBase64?: string;
  fileName?: string;
  check_number?: string;
  bank_details?: {
    bank: string;
    branch: string;
    account: string;
  };
}

interface Dress {
  id: number;
  name: string;
  base_price?: number;
  status: string;
  intended_use?: "rental" | "sale" | null;
  photo_url?: string | null;
  booked_dates?: string[];
  upcoming_orders?: Array<{
    order_id: number;
    event_date: string;
    order_status?: string;
    customer_name?: string | null;
    wearer_name?: string | null;
  }>;
}

function normalizeDateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.split("T")[0];
}

function isDressMatchingItemType(dress: Dress | undefined, itemType: string) {
  if (!dress) return false;
  const intendedUse = dress.intended_use || "rental";
  if (itemType === "sale") return intendedUse === "sale";
  if (itemType === "rental") return intendedUse === "rental";
  return false;
}

export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [createdOrderSignLink, setCreatedOrderSignLink] = useState<string>("");
  const [createdOrderWhatsappLink, setCreatedOrderWhatsappLink] = useState<string | null>(null);
  const [creatingSignLink, setCreatingSignLink] = useState(false);

  // Data lists
  const [customers, setCustomers] = useState<{ id: number; name: string; phone: string }[]>([]);
  const [dresses, setDresses] = useState<Dress[]>([]);
  
  // Form State
  const [customerMode, setCustomerMode] = useState<"search" | "new">("search");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "" });
  
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([
    { dress_id: "", dress_name: "", item_type: "rental", base_price: "", additional_payments: "", wearer_name: "", notes: "" }
  ]);
  const [depositPayments, setDepositPayments] = useState<DepositPayment[]>([
    { amount: "", method: "cash", notes: "", confirmation_number: "", last_four_digits: "", installments: "1" }
  ]);
  const [sharedApplied, setSharedApplied] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [dresRes, custRes] = await Promise.all([
          dressesApi.available(),
          customersApi.list({ limit: 10 })
        ]);
        
        if (dresRes.success) {
          const data = (dresRes.data as any).dresses;
          console.log("Dresses loaded:", data?.length);
          setDresses(data || []);
          if (!data || data.length === 0) {
            toast({ title: "שימי לב", description: "לא נמצאו שמלות פעילות במלאי", variant: "default" });
          }
        } else {
          toast({ title: "שגיאה", description: dresRes.message || "לא ניתן לטעון את רשימת השמלות", variant: "destructive" });
        }
        if (custRes.success) setCustomers((custRes.data as any).customers);
      } catch (e) {
        console.error("Error loading initial data:", e);
        toast({ title: "שגיאת תקשורת", description: "לא ניתן להתחבר לשרת", variant: "destructive" });
      }
    };
    loadInitialData();
  }, [toast]);

  useEffect(() => {
    if (sharedApplied) return;
    if (searchParams.get("shared_upload") !== "1") return;
    if (searchParams.get("share_context") !== "order_deposit") return;

    const payload = getSharedUploadPayload();
    if (!payload) return;

    setDepositPayments((prev) => {
      const current = prev.length > 0
        ? [...prev]
        : [{ amount: "", method: "cash", notes: "", confirmation_number: "", last_four_digits: "", installments: "1" }];

      current[0] = {
        ...current[0],
        method: current[0].method === "cash" ? "bit" : current[0].method,
        fileBase64: payload.base64,
        fileName: payload.fileName
      };
      return current;
    });

    clearSharedUploadPayload();
    setSharedApplied(true);
    toast({ title: "קובץ שותף נטען", description: "האסמכתא צורפה לתשלום הראשון במקדמה." });
  }, [searchParams, sharedApplied, toast]);

  useEffect(() => {
    if (customerMode === "search" && customerSearch.length > 1) {
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
  }, [customerSearch, customerMode]);

  const addItem = () => {
    setItems([...items, { dress_id: "", dress_name: "", item_type: "rental", base_price: "", additional_payments: "", wearer_name: "", notes: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const getDressById = (dressId: string) => {
    if (!dressId) return undefined;
    return dresses.find((dress) => dress.id.toString() === dressId);
  };

  const getDressUpcomingOrders = (dressId: string) => {
    const dress = getDressById(dressId);
    if (!dress) return [];

    if (dress.upcoming_orders && dress.upcoming_orders.length > 0) {
      return dress.upcoming_orders
        .map((order) => ({
          ...order,
          event_date: normalizeDateOnly(order.event_date),
        }))
        .filter((order) => Boolean(order.event_date))
        .sort((a, b) => a.event_date.localeCompare(b.event_date));
    }

    return (dress.booked_dates || [])
      .map((date) => normalizeDateOnly(date))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((date, idx) => ({
        order_id: idx + 1,
        event_date: date,
        order_status: "confirmed",
        customer_name: null,
        wearer_name: null,
      }));
  };

  const getDressBookedDates = (dressId: string) => {
    const uniqueDates = new Set(
      getDressUpcomingOrders(dressId)
        .map((order) => normalizeDateOnly(order.event_date))
        .filter(Boolean)
    );
    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === "item_type") {
      const requiresInventoryDress = value === "rental" || value === "sale";
      if (!requiresInventoryDress) {
        newItems[index].dress_id = "";
        newItems[index].dress_name = "";
      } else {
        const currentDress = getDressById(newItems[index].dress_id);
        if (!isDressMatchingItemType(currentDress, value)) {
          newItems[index].dress_id = "";
          newItems[index].dress_name = "";
        }
      }
    }

    if (field === "dress_id" && value) {
      const dress = getDressById(value);
      if (dress) {
        newItems[index].dress_name = dress.name;
        if (dress.base_price) {
          newItems[index].base_price = dress.base_price.toString();
        }
      }
    }

    if (field === "dress_id" && !value) {
      newItems[index].dress_name = "";
    }

    setItems(newItems);
  };

  const handleDepositFileChange = (e: React.ChangeEvent<HTMLInputElement>, paymentIndex: number) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { 
        toast({ title: "שגיאה", description: "הקובץ גדול מדי (מקסימום 5MB)", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Content = base64String.split(',')[1];
        const newPayments = [...depositPayments];
        newPayments[paymentIndex].fileBase64 = base64Content;
        newPayments[paymentIndex].fileName = file.name;
        setDepositPayments(newPayments);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSignLinkForCreatedOrder = async (orderId: number, openWhatsapp: boolean) => {
    setCreatingSignLink(true);
    try {
      const response = await agreementsApi.createSignLink(orderId);
      if (!response.success || !response.data) {
        throw new Error(response.message || "לא ניתן ליצור קישור חתימה");
      }

      const data = response.data as {
        link: string;
        whatsappLink?: string | null;
      };

      setCreatedOrderSignLink(data.link);
      setCreatedOrderWhatsappLink(data.whatsappLink || null);

      try {
        await navigator.clipboard.writeText(data.link);
        toast({ title: "קישור חתימה מוכן", description: "הקישור הועתק ללוח." });
      } catch {
        toast({ title: "קישור חתימה מוכן", description: data.link });
      }

      if (openWhatsapp && data.whatsappLink) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "לא ניתן ליצור קישור חתימה",
        variant: "destructive",
      });
    } finally {
      setCreatingSignLink(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (customerMode === "new" && !newCustomer.name?.trim()) {
      toast({ title: "שגיאה", description: "נא להזין שם לקוחה", variant: "destructive" });
      return;
    }
    if (customerMode === "search" && !selectedCustomerId) {
      toast({ title: "שגיאה", description: "נא לבחור לקוחה מהרשימה", variant: "destructive" });
      return;
    }
    if (!eventDate) {
      toast({ title: "שגיאה", description: "נא להזין תאריך אירוע", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const processedItems = items.map(item => ({
        dress_id: item.dress_id ? parseInt(item.dress_id) : undefined,
        dress_name: item.dress_name || dresses.find(d => d.id.toString() === item.dress_id)?.name || "",
        item_type: item.item_type,
        base_price: parseFloat(item.base_price) || 0,
        final_price: (parseFloat(item.base_price) || 0) + (parseFloat(item.additional_payments) || 0),
        wearer_name: item.wearer_name || "",
        notes: item.notes || "",
      }));

      const totalPrice = processedItems.reduce((sum, item) => sum + item.final_price, 0);
      const totalDeposit = depositPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      const payload: any = {
        event_date: eventDate,
        total_price: totalPrice,
        deposit_amount: totalDeposit,
        deposit_payments: depositPayments.filter(p => parseFloat(p.amount) > 0).map(p => ({
          amount: parseFloat(p.amount),
          payment_method: p.method,
          confirmation_number: p.confirmation_number || undefined,
          last_four_digits: p.last_four_digits || undefined,
          installments: p.installments ? parseInt(p.installments) : 1,
          check_number: p.check_number || undefined,
          bank_details: p.bank_details || undefined,
          notes: p.notes || undefined,
          fileBase64: p.fileBase64,
          fileName: p.fileName
        })),
        notes: notes || undefined,
        items: processedItems,
      };

      if (customerMode === "new") {
        payload.new_customer = newCustomer;
      } else {
        payload.customer_id = parseInt(selectedCustomerId);
      }

      const response = await ordersApi.create(payload);
      const newOrderId = Number((response.data as any)?.order?.id);

      toast({ title: "הצלחה!", description: "הזמנה נוצרה בהצלחה 🎉" });

      if (!Number.isNaN(newOrderId) && newOrderId > 0) {
        setCreatedOrderId(newOrderId);
        await generateSignLinkForCreatedOrder(newOrderId, false);
      } else {
        router.push("/dashboard/orders");
      }
    } catch (error) {
      toast({ title: "שגיאה", description: error instanceof Error ? error.message : "שגיאה בשמירת הזמנה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalPrice = items.reduce((sum, item) => 
    sum + (parseFloat(item.base_price) || 0) + (parseFloat(item.additional_payments) || 0), 0
  );

  if (createdOrderId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-2">
          <CardHeader>
            <CardTitle className="text-2xl font-black text-green-700">ההזמנה נשמרה בהצלחה</CardTitle>
            <p className="text-sm text-muted-foreground">הזמנה #{createdOrderId}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border p-4 bg-muted/20">
              <div className="flex items-center gap-2 mb-3 text-green-700">
                <Link2 className="h-4 w-4" />
                <p className="font-bold">לינק חתימה ללקוחה</p>
              </div>
              <Input
                value={createdOrderSignLink}
                readOnly
                className="mb-3 text-xs"
                placeholder={creatingSignLink ? "יוצר קישור..." : "לא נוצר קישור עדיין"}
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => generateSignLinkForCreatedOrder(createdOrderId, false)}
                  disabled={creatingSignLink}
                >
                  <Copy className="h-4 w-4 ml-2" />
                  {creatingSignLink ? "יוצר קישור..." : "העתקה מחדש"}
                </Button>
                <Button
                  type="button"
                  onClick={() => generateSignLinkForCreatedOrder(createdOrderId, true)}
                  disabled={creatingSignLink || !createdOrderWhatsappLink}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4 ml-2" />
                  שליחה לוואטסאפ
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/orders/${createdOrderId}/edit`)}
              >
                עריכה להזמנה
              </Button>
              <Button
                type="button"
                onClick={() => router.push("/dashboard/orders")}
                className="bg-green-600 hover:bg-green-700"
              >
                חזרה לרשימת הזמנות
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Header */}
      <div className="bg-background/80 backdrop-blur-md border-b px-4 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowRight className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-black">הזמנה חדשה</h1>
          </div>
          <div className="hidden sm:block text-sm font-medium text-muted-foreground">
            סה&quot;כ לתשלום: <span className="text-green-600 font-bold text-lg">{formatCurrency(totalPrice)}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
        
        {/* Customer Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <User className="h-5 w-5" />
            <h2 className="font-bold text-lg">פרטי לקוחה</h2>
          </div>
          
          <Card className="overflow-hidden border-2 focus-within:border-green-500/50 transition-colors">
            <div className="bg-muted/50 p-1 flex">
              <button
                type="button"
                onClick={() => setCustomerMode("search")}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-md transition-all",
                  customerMode === "search" ? "bg-white shadow text-green-600" : "text-muted-foreground"
                )}
              >
                לקוחה קיימת
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("new")}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-md transition-all",
                  customerMode === "new" ? "bg-white shadow text-green-600" : "text-muted-foreground"
                )}
              >
                לקוחה חדשה
              </button>
            </div>
            
            <CardContent className="p-4 sm:p-6">
              {customerMode === "search" ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="חפשי לפי שם או טלפון..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pr-10 focus:border-green-600"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {customers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(c.id.toString())}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border-2 text-right transition-all",
                          selectedCustomerId === c.id.toString() 
                            ? "border-green-600 bg-green-50 shadow-sm" 
                            : "border-transparent bg-muted/30 hover:bg-muted"
                        )}
                      >
                        <div>
                          <div className="font-bold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}</div>
                        </div>
                        {selectedCustomerId === c.id.toString() && <Check className="h-5 w-5 text-green-600" />}
                      </button>
                    ))}
                    {customerSearch.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode("new");
                          setNewCustomer(prev => ({ ...prev, name: customerSearch }));
                        }}
                        className="flex items-center justify-center p-3 rounded-xl border-2 border-dashed border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-all font-bold col-span-1 sm:col-span-2"
                      >
                        <Plus className="h-4 w-4 ml-2" />
                        יצירת לקוחה חדשה: "{customerSearch}"
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <ContactPicker 
                      onContactSelect={(contact) => {
                        setNewCustomer({
                          name: contact.name,
                          phone: normalizePhoneInput(contact.phone),
                          email: contact.email
                        });
                      }}
                      className="rounded-xl h-10 border-green-600 text-green-600 hover:bg-green-50"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">שם מלא *</label>
                      <Input
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                        placeholder="שם הלקוחה"
                        className="focus:border-green-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">טלפון *</label>
                      <Input
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({...newCustomer, phone: normalizePhoneInput(e.target.value)})}
                        placeholder="050-0000000"
                        className="text-left focus:border-green-600"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium">אימייל (אופציונלי)</label>
                      <Input
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                        placeholder="example@mail.com"
                        className="text-left focus:border-green-600"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Date Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <Calendar className="h-5 w-5" />
            <h2 className="font-bold text-lg">מועד האירוע</h2>
          </div>
          <Card className="border-2">
            <CardContent className="p-4 sm:p-6">
              <div className="max-w-xs">
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="focus:border-green-600"
                  required
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Items Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <ShoppingBag className="h-5 w-5" />
              <h2 className="font-bold text-lg">שמלות ופריטים</h2>
            </div>
            <Button type="button" variant="outline" onClick={addItem} className="rounded-xl border-green-600 text-green-600 hover:bg-green-50">
              <Plus className="h-4 w-4 ml-1" /> פריט נוסף
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => {
              const selectedDress = getDressById(item.dress_id);
              const bookedDates = getDressBookedDates(item.dress_id);
              const upcomingOrders = getDressUpcomingOrders(item.dress_id);
              const normalizedEventDate = normalizeDateOnly(eventDate);
              const hasExactConflict = Boolean(normalizedEventDate && bookedDates.includes(normalizedEventDate));

              return (
                <Card key={index} className="relative border-2 overflow-hidden">
                  <div className="absolute top-0 right-0 w-1 h-full bg-green-600" />
                  <CardContent className="p-4 sm:p-6 space-y-6">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-black text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs">פריט {index + 1}</span>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-destructive">
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">סוג הפעולה</label>
                        <div className="grid grid-cols-2 gap-2">
                          {ORDER_TYPES.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => updateItem(index, "item_type", t.value)}
                              className={cn(
                                "py-2 px-1 text-xs font-bold rounded-lg border transition-all",
                                item.item_type === t.value ? "bg-green-600 text-white border-green-600" : "bg-background border-input hover:bg-muted"
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">בחירת שמלה</label>
                        {(item.item_type === "rental" || item.item_type === "sale") ? (
                          <div className="space-y-3">
                            <DressSelector
                              dresses={dresses}
                              selectedId={item.dress_id}
                              itemType={item.item_type}
                              onSelect={(id) => updateItem(index, "dress_id", id)}
                            />
                            {selectedDress && (
                              <div
                                className={cn(
                                  "rounded-xl border p-3 space-y-2",
                                  hasExactConflict
                                    ? "bg-red-50 border-red-300"
                                    : bookedDates.length > 0
                                      ? "bg-amber-50 border-amber-300"
                                      : "bg-emerald-50 border-emerald-300"
                                )}
                              >
                                <p className="text-[11px] font-black text-gray-900">יומן תפוסה לשמלה</p>
                                <p className="text-[11px] text-muted-foreground">
                                  תאריך הזמנה נוכחית:{" "}
                                  <span className="font-black text-gray-900">
                                    {eventDate ? formatDateShort(eventDate) : "לא נבחר עדיין"}
                                  </span>
                                </p>

                                {bookedDates.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-[11px] font-bold text-gray-800">השמלה כבר מוזמנת לתאריכים:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {bookedDates.map((date) => (
                                        <span key={date} className="px-2 py-1 rounded-full bg-white border text-[10px] font-bold">
                                          {formatDateShort(date)}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="space-y-1">
                                      {upcomingOrders.map((order) => (
                                        <p key={`${order.order_id}-${order.event_date}`} className="text-[10px] text-muted-foreground">
                                          הזמנה #{order.order_id} • {formatDateShort(order.event_date)}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-green-700 font-medium">כרגע אין הזמנות עתידיות לשמלה הזו.</p>
                                )}

                                {hasExactConflict && (
                                  <p className="text-[11px] font-bold text-red-700">
                                    יש חפיפה לתאריך ההזמנה הנוכחי. אפשר להמשיך לפי שיקול דעת המנהלת.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Input
                            value={item.dress_name}
                            onChange={(e) => updateItem(index, "dress_name", e.target.value)}
                            placeholder="שם השמלה החדשה"
                            className="focus:border-green-600"
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">שם הלובשת (אופציונלי)</label>
                        <Input
                          value={item.wearer_name}
                          onChange={(e) => updateItem(index, "wearer_name", e.target.value)}
                          placeholder="מי תלבש את השמלה?"
                          className="focus:border-green-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">מחיר בסיס</label>
                          <Input
                            type="number"
                            value={item.base_price}
                            onChange={(e) => updateItem(index, "base_price", e.target.value)}
                            placeholder="0"
                            className="text-center text-lg font-bold focus:border-green-600"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">תוספות</label>
                          <Input
                            type="number"
                            value={item.additional_payments}
                            onChange={(e) => updateItem(index, "additional_payments", e.target.value)}
                            placeholder="0"
                            className="text-center text-lg font-bold focus:border-green-600"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Item Notes - collapsible for minimal UI clutter */}
                      <div className="sm:col-span-2">
                        <details className="group">
                          <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-green-600 transition-colors">
                            הערות לפריט {item.notes ? "📝" : "(לחצי להוספה)"}
                          </summary>
                          <div className="mt-2">
                            <Input
                              value={item.notes}
                              onChange={(e) => updateItem(index, "notes", e.target.value)}
                              placeholder="הערה ספציפית לפריט זה..."
                              className="focus:border-green-600"
                            />
                          </div>
                        </details>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Deposit Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CreditCard className="h-5 w-5" />
              <h2 className="font-bold text-lg">תשלום מקדמה</h2>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setDepositPayments([...depositPayments, { amount: "", method: "cash", notes: "", confirmation_number: "", last_four_digits: "", installments: "1" }])}
              className="rounded-xl border-green-600 text-green-600"
            >
              <Plus className="h-4 w-4 ml-1" /> תשלום נוסף
            </Button>
          </div>

          <div className="space-y-3">
            {depositPayments.map((payment, index) => (
              <Card key={index} className="border-2 bg-muted/10">
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground">סכום</label>
                    <Input
                      type="number"
                      value={payment.amount}
                      onChange={(e) => {
                        const next = [...depositPayments];
                        next[index].amount = e.target.value;
                        setDepositPayments(next);
                      }}
                      placeholder="0"
                      className="text-center font-bold focus:border-green-600"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground">אמצעי תשלום</label>
                    <select
                      value={payment.method}
                      onChange={(e) => {
                        const next = [...depositPayments];
                        next[index].method = e.target.value;
                        setDepositPayments(next);
                      }}
                      className="w-full h-11 px-3 border-b-2 border-input bg-background font-medium outline-none focus:border-green-600 transition-all"
                    >
                      <option value="cash">מזומן</option>
                      <option value="credit">אשראי</option>
                      <option value="bit">Bit</option>
                      <option value="paybox">פייבוקס</option>
                      <option value="transfer">העברה</option>
                      <option value="check">צ׳ק</option>
                    </select>
                  </div>
                  {payment.method === "credit" && (
                    <div className="space-y-2 sm:col-span-2 grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground">אסמכתא</label>
                        <Input
                          value={payment.confirmation_number || ""}
                          onChange={(e) => {
                            const next = [...depositPayments];
                            next[index].confirmation_number = e.target.value;
                            setDepositPayments(next);
                          }}
                          placeholder="מספר אישור..."
                          className="focus:border-green-600"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground">4 ספרות</label>
                        <Input
                          value={payment.last_four_digits || ""}
                          onChange={(e) => {
                            const next = [...depositPayments];
                            next[index].last_four_digits = e.target.value;
                            setDepositPayments(next);
                          }}
                          placeholder="****"
                          maxLength={4}
                          className="focus:border-green-600 text-center"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground">תשלומים</label>
                        <Input
                          type="number"
                          min="1"
                          value={payment.installments || "1"}
                          onChange={(e) => {
                            const next = [...depositPayments];
                            next[index].installments = e.target.value;
                            setDepositPayments(next);
                          }}
                          className="focus:border-green-600 text-center"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}
                  {(payment.method === "bit" || payment.method === "paybox" || payment.method === "transfer") && (
                    <div className="space-y-2 sm:col-span-1">
                      <label className="text-[10px] font-bold text-muted-foreground">אסמכתא</label>
                      <Input
                        value={payment.confirmation_number || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          next[index].confirmation_number = e.target.value;
                          setDepositPayments(next);
                        }}
                        placeholder="מספר אישור..."
                        className="focus:border-green-600"
                      />
                    </div>
                  )}

                  {/* Bank Transfer Details */}
                  {payment.method === "transfer" && (
                    <div className="sm:col-span-4 grid grid-cols-3 gap-2">
                      <Input 
                        placeholder="מס' בנק" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.bank || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.bank = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                      <Input 
                        placeholder="מס' סניף" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.branch || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.branch = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                      <Input 
                        placeholder="מס' חשבון" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.account || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.account = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                    </div>
                  )}

                  {/* Check Details */}
                  {payment.method === "check" && (
                    <div className="sm:col-span-4 grid grid-cols-4 gap-2">
                      <Input 
                        placeholder="מס' צ'ק" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.check_number || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          next[index].check_number = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                      <Input 
                        placeholder="מס' בנק" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.bank || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.bank = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                      <Input 
                        placeholder="מס' סניף" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.branch || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.branch = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                      <Input 
                        placeholder="מס' חשבון" 
                        className="h-10 text-center focus:border-green-600" 
                        value={payment.bank_details?.account || ""}
                        onChange={(e) => {
                          const next = [...depositPayments];
                          if (!next[index].bank_details) next[index].bank_details = { bank: "", branch: "", account: "" };
                          next[index].bank_details!.account = e.target.value;
                          setDepositPayments(next);
                        }}
                      />
                    </div>
                  )}

                  {payment.method !== "cash" && (
                    <div className="flex gap-2 sm:col-span-4">
                      <label className={cn(
                        "flex-1 flex items-center justify-center h-11 rounded-xl border-2 cursor-pointer transition-all",
                        payment.fileName ? "bg-green-50 border-green-300 text-green-700" : "bg-background border-dashed"
                      )}>
                        {payment.fileName ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                        <span className="text-[10px] mr-1 hidden sm:inline">{payment.fileName ? "הועלה" : "אסמכתא"}</span>
                        <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => handleDepositFileChange(e, index)} />
                      </label>
                      {depositPayments.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setDepositPayments(depositPayments.filter((_, i) => i !== index))} className="text-destructive">
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  )}
                  {payment.method === "cash" && depositPayments.length > 1 && (
                    <div className="sm:col-span-4 flex justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => setDepositPayments(depositPayments.filter((_, i) => i !== index))} className="text-destructive">
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <label className="font-bold text-lg text-green-600 block">הערות נוספות</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="כל פרט נוסף שחשוב לזכור..."
            className="w-full h-32 p-4 border-b-2 border-input bg-transparent focus:border-green-600 outline-none resize-none transition-all shadow-inner"
          />
        </section>

      </form>

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-xs text-muted-foreground font-bold uppercase">סה&quot;כ הזמנה</p>
            <p className="text-2xl font-black text-green-600">{formatCurrency(totalPrice)}</p>
          </div>
          <div className="flex-1 flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1 h-14 rounded-2xl text-lg font-bold border-2"
              onClick={() => router.back()}
            >
              ביטול
            </Button>
            <Button 
              className="flex-[2] h-14 rounded-2xl text-lg font-bold shadow-xl shadow-green-500/20 bg-green-600 hover:bg-green-700"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "יוצר הזמנה..." : "צרי הזמנה 🎉"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
