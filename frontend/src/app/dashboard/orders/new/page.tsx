"use client";

/**
 * New Order Page
 *
 * Purpose: A comprehensive page for creating new orders.
 * Replaces the old modal-based system. Optimized for both desktop and mobile.
 * Features:
 *   - Multiple items per order
 *   - Deposit payments with receipts
 *   - Customer search/creation
 *   - Order-level file attachments queued locally and uploaded right after the
 *     order is created (POST /api/orders/:orderId/attachments). The attachment
 *     API requires an existing orderId, so files are kept in component state as
 *     File objects until creation succeeds, then sent in a single multipart call.
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
  MessageCircle,
  FileSignature,
  Paperclip,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { customersApi, dressesApi, ordersApi, agreementsApi } from "@/lib/api";
import { cn, formatCurrency, formatDateShort, normalizePhoneInput } from "@/lib/utils";
import { DressSelector } from "@/components/dashboard/dress-selector";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { clearSharedUploadPayload, getSharedUploadPayload, compressImageForUpload, prepareAttachmentsForUpload } from "@/lib/shared-upload";
import { reportClientError } from "@/lib/error-reporter";

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
  const intendedUse = dress.intended_use;
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
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", source: "" });

  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([
    { dress_id: "", dress_name: "", item_type: "rental", base_price: "", additional_payments: "", wearer_name: "", notes: "" }
  ]);
  const [depositPayments, setDepositPayments] = useState<DepositPayment[]>([
    { amount: "", method: "cash", notes: "", confirmation_number: "", last_four_digits: "", installments: "1" }
  ]);
  // Order-level attachments queued before submission. Uploaded to the server
  // immediately after the order is created (when we finally have an orderId).
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
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

  const handleDepositFileChange = async (e: React.ChangeEvent<HTMLInputElement>, paymentIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "הקובץ גדול מדי", description: "הגודל המרבי הוא 20MB. נסי לצלם שוב ברזולוציה נמוכה יותר.", variant: "destructive" });
      return;
    }

    try {
      // Compress images via canvas to avoid exceeding server body-size limits.
      // PDFs pass through unmodified inside compressImageForUpload.
      const base64Content = await compressImageForUpload(file);
      const newPayments = [...depositPayments];
      newPayments[paymentIndex].fileBase64 = base64Content;
      newPayments[paymentIndex].fileName = file.name;
      setDepositPayments(newPayments);
    } catch (err) {
      console.error('File read/compress error:', err);
      toast({ title: "שגיאה בקריאת הקובץ", description: "לא ניתן לקרוא את הקובץ. נסי לצלם שוב.", variant: "destructive" });
      reportClientError({
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        component: 'NewOrder',
        action: 'קריאת קובץ אסמכתא (מקדמה)'
      });
    }
  };

  // Compress images at queue time so the user sees the final size before
  // submission and the bulk upload after order creation stays well under the
  // Vercel proxy body limit.
  const handlePendingAttachmentAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    try {
      const prepared = await prepareAttachmentsForUpload(files);
      setPendingAttachments((prev) => [...prev, ...prepared]);
    } catch (compressionError) {
      // Compression helper itself never throws (it falls back to the original
      // file on any error), but guard anyway so a queue add never breaks the
      // form. Fall back to the raw files.
      setPendingAttachments((prev) => [...prev, ...files]);
      reportClientError({
        message: compressionError instanceof Error ? compressionError.message : String(compressionError),
        component: 'NewOrder',
        action: 'דחיסת קובץ מצורף בתור'
      });
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatPendingFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageMimeType = (mime: string | null | undefined) => mime?.startsWith("image/");

  const generateSignLinkForCreatedOrder = async (
    orderId: number,
    options?: { openWhatsapp?: boolean; copyToClipboard?: boolean }
  ): Promise<string | null> => {
    const shouldOpenWhatsapp = options?.openWhatsapp === true;
    const shouldCopyToClipboard = options?.copyToClipboard !== false;
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

      if (shouldCopyToClipboard) {
        try {
          await navigator.clipboard.writeText(data.link);
          toast({ title: "קישור חתימה מוכן", description: "הקישור הועתק ללוח." });
        } catch {
          toast({ title: "קישור חתימה מוכן", description: data.link });
        }
      }

      if (shouldOpenWhatsapp && data.whatsappLink) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }

      return data.link;
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "לא ניתן ליצור קישור חתימה",
        variant: "destructive",
      });
      return null;
    } finally {
      setCreatingSignLink(false);
    }
  };

  const openImmediateSignPage = async () => {
    if (!createdOrderId) return;

    let link = createdOrderSignLink;
    if (!link) {
      const generatedLink = await generateSignLinkForCreatedOrder(createdOrderId, { copyToClipboard: false });
      if (!generatedLink) return;
      link = generatedLink;
    }

    window.location.assign(link);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (customerMode === "new" && !newCustomer.name.trim()) {
      toast({ title: "שגיאה", description: "נא למלא שם של הלקוחה החדשה", variant: "destructive" });
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
        additional_payments: parseFloat(item.additional_payments) || 0,
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

        // Upload any files the user queued in the attachments section. The
        // attachments endpoint requires an existing orderId, so this only runs
        // after the order has been created successfully. A failure here does
        // not roll back the order — we surface a non-fatal toast and continue.
        if (pendingAttachments.length > 0) {
          try {
            await ordersApi.uploadAttachment(newOrderId, pendingAttachments);
            setPendingAttachments([]);
          } catch (uploadError) {
            const uploadMessage = uploadError instanceof Error ? uploadError.message : "שגיאה בהעלאת קבצים מצורפים";
            toast({
              title: "שגיאה בהעלאת קבצים מצורפים",
              description: `${uploadMessage}. ההזמנה נוצרה. אפשר לצרף אותם דרך מסך עריכת ההזמנה.`,
              variant: "destructive",
            });
            reportClientError({
              message: uploadMessage,
              stack: uploadError instanceof Error ? uploadError.stack : undefined,
              component: 'NewOrder',
              action: 'העלאת קבצים מצורפים להזמנה חדשה'
            });
          }
        }

        await generateSignLinkForCreatedOrder(newOrderId);
      } else {
        router.push("/dashboard/orders");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאה בשמירת הזמנה";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
      reportClientError({
        message,
        stack: error instanceof Error ? error.stack : undefined,
        component: 'NewOrder',
        action: 'שמירת הזמנה'
      });
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
                  onClick={() => generateSignLinkForCreatedOrder(createdOrderId)}
                  disabled={creatingSignLink}
                >
                  <Copy className="h-4 w-4 ml-2" />
                  {creatingSignLink ? "יוצר קישור..." : "העתקה מחדש"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openImmediateSignPage}
                  disabled={creatingSignLink}
                >
                  <FileSignature className="h-4 w-4 ml-2" />
                  חתימה מיידית
                </Button>
                <Button
                  type="button"
                  onClick={() => generateSignLinkForCreatedOrder(createdOrderId, { openWhatsapp: true })}
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

        <Card className="border-2 shadow-sm">
          <CardContent className="p-4 sm:p-6 space-y-6">
            {/* Customer Sub-section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-green-600">
                  <User className="h-5 w-5" />
                  <h2 className="font-bold text-base sm:text-lg">לקוחה</h2>
                </div>
                <div className="bg-muted/50 p-1 flex rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("search")}
                    className={cn(
                      "px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all",
                      customerMode === "search" ? "bg-white shadow-sm text-green-600" : "text-muted-foreground"
                    )}
                  >
                    קיימת
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("new")}
                    className={cn(
                      "px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all",
                      customerMode === "new" ? "bg-white shadow-sm text-green-600" : "text-muted-foreground"
                    )}
                  >
                    חדשה
                  </button>
                </div>
              </div>

              {customerMode === "search" ? (
                <div className="space-y-3 relative z-10">
                  {selectedCustomerId ? (() => {
                    const c = customers.find(x => x.id.toString() === selectedCustomerId);
                    return (
                      <div className="flex items-center justify-between p-3 rounded-xl border-2 border-green-600 bg-green-50 shadow-sm">
                        <div>
                          <div className="font-bold text-sm text-green-800">{c?.name}</div>
                          <div className="text-xs text-green-700">{c?.phone}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerId("")}
                          className="p-2 hover:bg-green-100 rounded-full text-green-700 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    );
                  })() : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="חיפוש לפי שם או טלפון..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="pr-10 h-12 focus:border-green-600 rounded-xl"
                        />
                      </div>

                      {(customers.length > 0 || customerSearch.length > 1) && (
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-1 bg-muted/20 rounded-xl border">
                          {customers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCustomerId(c.id.toString())}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border-2 text-right transition-all",
                                selectedCustomerId === c.id.toString()
                                  ? "border-green-600 bg-green-50 shadow-sm"
                                  : "border-transparent bg-white hover:bg-muted"
                              )}
                            >
                              <div>
                                <div className="font-bold text-sm">{c.name}</div>
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
                              className="flex items-center justify-center p-3 rounded-lg border-2 border-dashed border-green-300 bg-green-50/50 text-green-700 hover:bg-green-100 transition-all font-bold text-sm"
                            >
                              <Plus className="h-4 w-4 ml-1" />
                              יצירת לקוחה: "{customerSearch}"
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end -mt-2">
                    <ContactPicker
                      onContactSelect={(contact) => {
                        setNewCustomer({
                          name: contact.name,
                          phone: normalizePhoneInput(contact.phone),
                          source: ""
                        });
                      }}
                      className="rounded-xl h-8 text-xs border-green-600 text-green-600 hover:bg-green-50"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">שם מלא *</label>
                      <Input
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        placeholder="שם הלקוחה"
                        className="h-12 focus:border-green-600 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">טלפון</label>
                      <Input
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: normalizePhoneInput(e.target.value) })}
                        placeholder="050-0000000"
                        className="h-12 text-left focus:border-green-600 rounded-xl"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">מקור</label>
                      <Input
                        value={newCustomer.source}
                        onChange={(e) => setNewCustomer({ ...newCustomer, source: e.target.value })}
                        placeholder="מאיפה הגיעה?"
                        className="h-12 focus:border-green-600 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px w-full bg-border" />

            {/* Date Sub-section */}
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-green-600 shrink-0">
                <Calendar className="h-5 w-5" />
                <h2 className="font-bold text-base sm:text-lg">מועד אירוע</h2>
              </div>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="focus:border-green-600 h-12 text-sm sm:text-base rounded-xl w-full max-w-[160px] text-center"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Items Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600 mb-2 px-1">
              <ShoppingBag className="h-5 w-5" />
              <h2 className="font-bold text-base sm:text-lg">שמלות ופריטים</h2>
            </div>
            <Button type="button" variant="outline" onClick={addItem} className="rounded-xl border-green-600 text-green-600 hover:bg-green-50 h-10 px-3">
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
                <div key={index} className="relative pt-3">
                  {/* Floating Badge Header */}
                  <div className="absolute top-0 right-4 z-10 flex items-center justify-between w-[calc(100%-2rem)]">
                    <span className="font-black text-green-700 bg-green-100 border border-green-200 px-3 py-1 rounded-full text-[10px] shadow-sm">
                      פריט {index + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-destructive bg-white border border-destructive/20 rounded-full p-1 shadow-sm hover:bg-destructive hover:text-white transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Card className="relative border-2 overflow-visible rounded-xl shadow-sm">
                    <div className="absolute top-0 right-0 w-1 h-full bg-green-600 rounded-r-xl" />
                    <CardContent className="p-3 sm:p-5 pt-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">סוג פעולה</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {ORDER_TYPES.map((t) => (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => updateItem(index, "item_type", t.value)}
                                className={cn(
                                  "py-1.5 px-1 text-[11px] font-bold rounded-md border transition-all",
                                  item.item_type === t.value ? "bg-green-600 text-white border-green-600" : "bg-background border-input hover:bg-muted"
                                )}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">בחירת שמלה</label>
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
                                            {order.customer_name ? ` • ${order.customer_name}` : ""}
                                            {order.wearer_name ? ` • לובשת: ${order.wearer_name}` : ""}
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
                              className="h-10 rounded-xl border-2"
                            />
                          )}
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">שם הלובשת</label>
                          <Input
                            value={item.wearer_name}
                            onChange={(e) => updateItem(index, "wearer_name", e.target.value)}
                            placeholder="שם מלא (אופציונלי)"
                            className="h-10 rounded-xl border-2"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">מחיר בסיס</label>
                            <Input
                              type="number"
                              step="1"
                              value={item.base_price}
                              onChange={(e) => updateItem(index, "base_price", e.target.value)}
                              onFocus={(e) => { if (e.target.value === "0") e.target.select(); }}
                              onKeyDown={(e) => {
                                if (e.key === '.' || e.key === '-') e.preventDefault();
                              }}
                              placeholder="0"
                              className="h-10 rounded-xl border-2 text-center text-sm font-bold"
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">תוספות</label>
                            <Input
                              type="number"
                              step="1"
                              value={item.additional_payments}
                              onChange={(e) => updateItem(index, "additional_payments", e.target.value)}
                              onFocus={(e) => { if (e.target.value === "0") e.target.select(); }}
                              onKeyDown={(e) => {
                                if (e.key === '.' || e.key === '-') e.preventDefault();
                              }}
                              placeholder="0"
                              className="h-10 rounded-xl border-2 text-center text-sm font-bold"
                              dir="ltr"
                            />
                          </div>
                        </div>

                        {/* Item Notes - collapsible for minimal UI clutter */}
                        <div className="sm:col-span-2 mt-1">
                          <details className="group">
                            <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-green-600 transition-colors">
                              הערות לפריט {item.notes ? "📝" : "(לחצי להוספה)"}
                            </summary>
                            <div className="mt-2">
                              <Input
                                value={item.notes}
                                onChange={(e) => updateItem(index, "notes", e.target.value)}
                                placeholder="הערה ספציפית לפריט זה..."
                                className="h-10 rounded-xl border-2"
                              />
                            </div>
                          </details>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={addItem} className="rounded-xl border-green-600 text-green-600 hover:bg-green-50">
              <Plus className="h-4 w-4 ml-1" /> פריט נוסף
            </Button>
          </div>
        </div>

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
                      step="1"
                      value={payment.amount}
                      onChange={(e) => {
                        const next = [...depositPayments];
                        next[index].amount = e.target.value;
                        setDepositPayments(next);
                      }}
                      onFocus={(e) => { if (e.target.value === "0") e.target.select(); }}
                      onKeyDown={(e) => {
                        if (e.key === '.' || e.key === '-') e.preventDefault();
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

        {/* Attachments
            Files are kept locally as File objects until the order is created.
            After successful creation, handleSubmit uploads them in a single
            multipart request via ordersApi.uploadAttachment(). */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <Paperclip className="h-5 w-5" />
              <h2 className="font-bold text-lg">קבצים מצורפים</h2>
              {pendingAttachments.length > 0 && (
                <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{pendingAttachments.length}</span>
              )}
            </div>
            <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all border-green-600 text-green-600 hover:bg-green-50">
              <Plus className="h-3.5 w-3.5" />
              הוסף קובץ
              <input type="file" multiple className="hidden" onChange={handlePendingAttachmentAdd} />
            </label>
          </div>

          {pendingAttachments.length === 0 ? (
            <Card className="border-2"><CardContent className="p-4 text-center text-muted-foreground text-sm italic">אין קבצים מצורפים. הקבצים יעלו לאחר יצירת ההזמנה.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pendingAttachments.map((file, index) => {
                const previewUrl = isImageMimeType(file.type) ? URL.createObjectURL(file) : null;
                return (
                  <Card key={`${file.name}-${index}`} className="border-2">
                    <CardContent className="p-3 flex items-center gap-3">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="h-14 w-14 object-cover rounded-xl border shrink-0"
                          onLoad={() => URL.revokeObjectURL(previewUrl)}
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatPendingFileSize(file.size)}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => removePendingAttachment(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
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
