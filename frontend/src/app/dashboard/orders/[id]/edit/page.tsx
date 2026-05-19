"use client";

/**
 * Edit Order Page
 * 
 * Purpose: A comprehensive page for editing existing orders.
 * Language: Feminine.
 */

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowRight,
  ShoppingBag,
  Calendar,
  Plus,
  Trash2,
  Link2,
  MessageCircle,
  Copy,
  Paperclip,
  Download,
  FileText,
  Check,
  X,
  FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { dressesApi, ordersApi, agreementsApi } from "@/lib/api";
import { cn, formatCurrency, formatDateShort, resolveFileUrl } from "@/lib/utils";
import { reportClientError } from "@/lib/error-reporter";
import { prepareAttachmentsForUpload } from "@/lib/shared-upload";
import { DressSelector } from "@/components/dashboard/dress-selector";

const ORDER_TYPES = [
  { value: "rental", label: "השכרה" },
  { value: "sewing_for_rental", label: "תפירה שנשארת בהשכרה" },
  { value: "sewing", label: "תפירה" },
  { value: "sale", label: "מכירה" },
];

interface Dress {
  id: number;
  name: string;
  base_price?: number;
  status: string;
  intended_use?: "rental" | "sale" | null;
  photo_url?: string | null;
  thumbnail_url?: string | null;
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

interface OrderItem {
  id?: number;
  dress_id: string;
  dress_name: string;
  item_type: string;
  base_price: string;
  additional_payments: string;
  wearer_name: string;
  notes: string;
}

const isOrderVersionSigned = (orderUpdatedAt?: string | null, agreementSignedAt?: string | null) => {
  if (!orderUpdatedAt || !agreementSignedAt) return false;

  const normalizeForDateParse = (value: string) => (value.includes("T") ? value : value.replace(" ", "T"));
  const orderTs = Date.parse(normalizeForDateParse(orderUpdatedAt));
  const signedTs = Date.parse(normalizeForDateParse(agreementSignedAt));

  if (!Number.isNaN(orderTs) && !Number.isNaN(signedTs)) {
    return orderTs <= signedTs;
  }

  return String(orderUpdatedAt) <= String(agreementSignedAt);
};

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingSignLink, setSendingSignLink] = useState(false);
  const [generatedSignLink, setGeneratedSignLink] = useState("");

  // Data lists
  const [dresses, setDresses] = useState<Dress[]>([]);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [orderUpdatedAt, setOrderUpdatedAt] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");

  // Attachments state
  const [attachments, setAttachments] = useState<{
    id: number; original_name: string; stored_name: string;
    mime_type: string | null; size_bytes: number;
    description: string | null; url: string;
  }[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [editingDescId, setEditingDescId] = useState<number | null>(null);
  const [editingDescText, setEditingDescText] = useState("");
  const [latestAgreement, setLatestAgreement] = useState<{
    id: number;
    agreed_at?: string | null;
    created_at?: string | null;
    pdf_url?: string | null;
  } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dresRes, orderRes] = await Promise.all([
          dressesApi.available(),
          ordersApi.get(parseInt(orderId))
        ]);

        let availableDresses: Dress[] = [];
        if (dresRes.success) {
          availableDresses = (dresRes.data as any).dresses || [];
        } else {
          console.error("Dresses load failed:", dresRes.message);
        }

        if (orderRes.success && orderRes.data) {
          const data = orderRes.data as any;
          const order = data.order;
          setSelectedCustomerId(order.customer_id?.toString() || "");
          setCustomerName(order.customer_name || "");
          setCustomerPhone(order.customer_phone || "");
          setEventDate(order.event_date ? order.event_date.split("T")[0] : "");
          setNotes(order.notes || "");
          setOrderUpdatedAt(order.updated_at || null);
          setLatestAgreement(data.agreement || null);

          if (data.items && Array.isArray(data.items)) {
            const availableIds = new Set(availableDresses.map(d => d.id));
            for (const it of data.items) {
              if (it.dress_id && !availableIds.has(it.dress_id)) {
                // Build a full Dress stub from the enriched order GET fields so
                // the DressSelector trigger button can show image + metadata for
                // sold/retired dresses already on the order.
                availableDresses.push({
                  id: it.dress_id,
                  name: it.dress_name || `שמלה #${it.dress_id}`,
                  base_price: it.dress_base_price ?? it.base_price ?? 0,
                  status: it.dress_status || "available",
                  intended_use: it.dress_intended_use ?? null,
                  photo_url: it.dress_photo ?? null,
                  thumbnail_url: it.dress_thumbnail ?? null,
                  booked_dates: [],
                  upcoming_orders: [],
                });
                availableIds.add(it.dress_id);
              }
            }

            setItems(data.items.map((it: any) => ({
              id: it.id,
              dress_id: it.dress_id?.toString() || "",
              dress_name: it.dress_name || "",
              item_type: it.item_type || "rental",
              base_price: (it.base_price ?? 0).toString(),
              additional_payments: (it.additional_payments ?? 0).toString(),
              wearer_name: it.wearer_name || "",
              notes: it.notes || "",
            })));
          }
        } else {
          toast({ title: "שגיאה", description: orderRes.message || "הזמנה לא נמצאה", variant: "destructive" });
        }

        setDresses(availableDresses);
      } catch (e) {
        console.error("Error loading order for edit:", e);
        toast({ title: "שגיאה", description: "לא ניתן לטעון את פרטי ההזמנה. בדקי את החיבור לשרת.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [orderId, toast]);

  // Fetch attachments
  useEffect(() => {
    if (orderId) {
      setLoadingAttachments(true);
      ordersApi.getAttachments(parseInt(orderId))
        .then(res => { if (res.success && res.data) setAttachments((res.data as any).attachments || []); })
        .catch(() => { })
        .finally(() => setLoadingAttachments(false));
    }
  }, [orderId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    setUploadingFiles(true);
    try {
      // Compress images client-side (max 2400px, JPEG q=0.92) before sending so
      // multipart payloads stay under the Vercel proxy body limit. PDFs and
      // other non-image files pass through untouched.
      const prepared = await prepareAttachmentsForUpload(files);
      const res = await ordersApi.uploadAttachment(parseInt(orderId), prepared);
      if (res.success && res.data) {
        setAttachments(prev => [...((res.data as any).attachments || []), ...prev]);
      }
      toast({ title: "הצלחה", description: `${prepared.length} קבצים הועלו` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בהעלאה";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
      reportClientError({
        message,
        stack: err instanceof Error ? err.stack : undefined,
        component: 'EditOrder',
        action: 'העלאת קובץ מצורף'
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm("למחוק קובץ זה?")) return;
    try {
      await ordersApi.deleteAttachment(parseInt(orderId), attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch {
      toast({ title: "שגיאה", description: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleSaveDescription = async (attachmentId: number) => {
    try {
      await ordersApi.updateAttachment(parseInt(orderId), attachmentId, { description: editingDescText });
      setAttachments(prev => prev.map(a => a.id === attachmentId ? { ...a, description: editingDescText } : a));
      setEditingDescId(null);
    } catch {
      toast({ title: "שגיאה", description: "שגיאה בעדכון", variant: "destructive" });
    }
  };

  const isImageMime = (mime: string | null) => mime?.startsWith("image/");
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const addItem = () => {
    setItems([...items, { dress_id: "", dress_name: "", item_type: "rental", base_price: "", additional_payments: "", wearer_name: "", notes: "" }]);
  };

  const handleSendSignatureLink = async (
    options?: { openWhatsapp?: boolean; copyToClipboard?: boolean }
  ): Promise<string | null> => {
    const shouldOpenWhatsapp = options?.openWhatsapp === true;
    const shouldCopyToClipboard = options?.copyToClipboard !== false;
    setSendingSignLink(true);
    try {
      const response = await agreementsApi.createSignLink(parseInt(orderId));
      if (!response.success || !response.data) {
        throw new Error(response.message || "לא ניתן ליצור קישור חתימה");
      }

      const data = response.data as {
        link: string;
        whatsappLink?: string | null;
      };

      setGeneratedSignLink(data.link);

      if (shouldCopyToClipboard) {
        try {
          await navigator.clipboard.writeText(data.link);
          toast({ title: "קישור חתימה נוצר", description: "הקישור הועתק ללוח." });
        } catch {
          toast({ title: "קישור חתימה נוצר", description: data.link });
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
        variant: "destructive"
      });
      return null;
    } finally {
      setSendingSignLink(false);
    }
  };

  const handleImmediateSign = async () => {
    let link = generatedSignLink;
    if (!link) {
      const generatedLink = await handleSendSignatureLink({ copyToClipboard: false });
      if (!generatedLink) return;
      link = generatedLink;
    }

    window.location.assign(link);
  };

  const latestAgreementSignedAt = latestAgreement?.agreed_at || latestAgreement?.created_at || null;
  const isCurrentOrderVersionSigned = isOrderVersionSigned(orderUpdatedAt, latestAgreementSignedAt);
  const signedAgreementPdfUrl = latestAgreement?.pdf_url || null;

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventDate) {
      toast({ title: "שגיאה", description: "נא להזין תאריך אירוע", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const processedItems = items.map(item => ({
        id: item.id,
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

      const payload: any = {
        event_date: eventDate,
        total_price: totalPrice,
        notes: notes || undefined,
        items: processedItems,
        customer_id: parseInt(selectedCustomerId)
      };

      await ordersApi.update(parseInt(orderId), payload);
      toast({ title: "הצלחה!", description: "הזמנה עודכנה בהצלחה 🎉" });
      router.push("/dashboard/orders");
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאה בעדכון ההזמנה";
      toast({ title: "שגיאה", description: message, variant: "destructive" });
      reportClientError({
        message,
        stack: error instanceof Error ? error.stack : undefined,
        component: 'EditOrder',
        action: 'עדכון הזמנה'
      });
    } finally {
      setSaving(false);
    }
  };

  const totalPrice = items.reduce((sum, item) =>
    sum + (parseFloat(item.base_price) || 0) + (parseFloat(item.additional_payments) || 0), 0
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">טוען...</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-background/80 backdrop-blur-md border-b px-4 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowRight className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-black">עריכת הזמנה #{orderId}</h1>
          </div>
          <div className="hidden sm:block text-sm font-medium text-muted-foreground">
            לקוחה: <span className="text-green-600 font-bold">{customerName}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8">

        <Card className="border-2 shadow-sm">
          <CardContent className="p-4 sm:p-6 space-y-6">
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

            <div className="h-px w-full bg-border" />

            {/* Agreement Link Sub-section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <Link2 className="h-5 w-5" />
                <h2 className="font-bold text-base sm:text-lg">חתימה דיגיטלית</h2>
              </div>
              {isCurrentOrderVersionSigned ? (
                <Button
                  type="button"
                  onClick={() => {
                    if (!signedAgreementPdfUrl) return;
                    window.open(signedAgreementPdfUrl, "_blank", "noopener,noreferrer");
                  }}
                  disabled={!signedAgreementPdfUrl}
                  className="w-full bg-green-600 hover:bg-green-700 h-10 px-2 text-[10px] sm:text-xs font-bold"
                >
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                  צפיה בחתימה
                </Button>
              ) : (
                <>
                  {signedAgreementPdfUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open(signedAgreementPdfUrl, "_blank", "noopener,noreferrer")}
                      className="w-full h-10 px-2 text-[10px] sm:text-xs font-bold"
                    >
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                      צפיה בחתימה
                    </Button>
                  )}
                  <div className="flex flex-row items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSendSignatureLink()}
                      disabled={sendingSignLink}
                      className="flex-1 border-green-600 text-green-700 h-10 px-2 text-[10px] sm:text-xs font-bold"
                    >
                      <Copy className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                      {sendingSignLink ? "מייצר..." : "העתקת קישור"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleImmediateSign}
                      disabled={sendingSignLink}
                      className="flex-1 h-10 px-2 text-[10px] sm:text-xs font-bold"
                    >
                      <FileSignature className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                      חתימה
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleSendSignatureLink({ openWhatsapp: true })}
                      disabled={sendingSignLink || !customerPhone}
                      className="flex-1 bg-green-600 hover:bg-green-700 h-10 px-2 text-[10px] sm:text-xs font-bold"
                    >
                      <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                      שליחה בווצאפ
                    </Button>
                  </div>
                </>
              )}
              {!customerPhone && (
                <p className="text-[10px] text-muted-foreground mt-2 leading-tight">
                  חסר טלפון לקוחה בהזמנה. לא ניתן לשלוח הודעת WhatsApp.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

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
                          {ORDER_TYPES.map(t => (
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
                            value={item.base_price}
                            onChange={(e) => updateItem(index, "base_price", e.target.value)}
                            className="h-10 rounded-xl border-2 text-center text-sm font-bold"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">תוספות</label>
                          <Input
                            type="number"
                            value={item.additional_payments}
                            onChange={(e) => updateItem(index, "additional_payments", e.target.value)}
                            className="h-10 rounded-xl border-2 text-center text-sm font-bold"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <details className="group">
                          <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-green-600">
                            הערות {item.notes ? "📝" : "(לחצי להוספה)"}
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
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <label className="font-bold text-lg text-green-600 block">הערות נוספות</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="כל פרט נוסף שחשוב לזכור..."
            className="w-full h-32 p-4 rounded-2xl border-2 bg-background focus:border-green-600 outline-none resize-none shadow-inner"
          />
        </section>

        {/* Attachments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <Paperclip className="h-5 w-5" />
              <h2 className="font-bold text-lg">קבצים מצורפים</h2>
              {attachments.length > 0 && (
                <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{attachments.length}</span>
              )}
            </div>
            <label className={cn(
              "cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all",
              uploadingFiles ? "opacity-50 cursor-wait" : "border-green-600 text-green-600 hover:bg-green-50"
            )}>
              <Plus className="h-3.5 w-3.5" />
              {uploadingFiles ? "מעלה..." : "הוסף קובץ"}
              <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploadingFiles} />
            </label>
          </div>

          {loadingAttachments ? (
            <Card className="border-2"><CardContent className="p-4 text-center text-muted-foreground text-sm">טוען קבצים...</CardContent></Card>
          ) : attachments.length === 0 ? (
            <Card className="border-2"><CardContent className="p-4 text-center text-muted-foreground text-sm italic">אין קבצים מצורפים</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {attachments.map((att) => (
                <Card key={att.id} className="border-2">
                  <CardContent className="p-3 flex items-center gap-3">
                    {isImageMime(att.mime_type) ? (
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <img src={att.url} alt={att.original_name} className="h-14 w-14 object-cover rounded-xl border" />
                      </a>
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {editingDescId === att.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editingDescText}
                            onChange={(e) => setEditingDescText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveDescription(att.id); if (e.key === "Escape") setEditingDescId(null); }}
                            className="flex-1 h-8 px-2 text-sm border rounded-lg"
                            placeholder="תיאור..."
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" type="button" onClick={() => handleSaveDescription(att.id)}><Check className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" type="button" onClick={() => setEditingDescId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <p
                          className="font-bold text-sm truncate cursor-pointer hover:text-green-600 transition-colors"
                          onClick={() => { setEditingDescId(att.id); setEditingDescText(att.description || att.original_name); }}
                        >
                          {att.description || att.original_name}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(att.size_bytes)}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a
                        href={ordersApi.attachmentDownloadUrl(parseInt(orderId), att.id)}
                        download
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-green-600 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <Button size="icon" variant="ghost" type="button" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteAttachment(att.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

      </form>

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
              {saving ? "מעדכן..." : "שמרי שינויים ✨"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
