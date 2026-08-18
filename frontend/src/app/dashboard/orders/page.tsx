"use client";

/**
 * Orders Management Page
 * 
 * Purpose: Display and manage rental orders, sewing orders, and sales.
 * Replaces modals with dedicated pages for creation and editing.
 * Language: Feminine.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ordersApi, agreementsApi } from "@/lib/api";
import {
  formatCurrency,
  formatDateShort,
  getStatusLabel,
  getStatusColor,
  computeOrderDisplayStatus,
  createWhatsAppLink,
  formatPhoneNumber,
  resolveFileUrl,
  cn,
} from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { prepareAttachmentsForUpload } from "@/lib/shared-upload";
import {
  ShoppingBag,
  Plus,
  MessageCircle,
  Link2,
  Copy,
  Edit,
  Trash2,
  X,
  Calendar,
  CreditCard,
  Eye,
  Check,
  Paperclip,
  Download,
  FileText,
  Search,
  FileSignature,
} from "lucide-react";

interface Order {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  event_date: string | null;
  total_price: number;
  total_customer_charge: number;
  deposit_amount: number;
  paid_amount: number;
  status: string;
  notes: string | null;
  order_summary: string | null;
  local_agreement_path?: string | null;
  source?: string | null;
  created_at: string;
  updated_at?: string;
}

interface OrderDetailData {
  order: Order;
  items: any[];
  agreement?: {
    id: number;
    agreed_at?: string | null;
    created_at?: string | null;
    pdf_url?: string | null;
  } | null;
}

interface Attachment {
  id: number;
  order_id: number;
  original_name: string;
  stored_name: string;
  mime_type: string | null;
  size_bytes: number;
  description: string | null;
  url: string;
  download_url: string;
  created_at: string;
}

// Helper to translate item type to Hebrew
const getItemTypeLabel = (type: string) => {
  const types: Record<string, string> = {
    'rental': 'השכרה',
    'sewing_for_rental': 'תפירה שנשארת בהשכרה',
    'sewing': 'תפירה',
    'sale': 'מכירה',
  };
  return types[type] || type;
};

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

export default function OrdersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("event_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const [viewingOrderData, setViewingOrderData] = useState<OrderDetailData | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [creatingSignLinkForOrderId, setCreatingSignLinkForOrderId] = useState<number | null>(null);
  const [viewSignLink, setViewSignLink] = useState<{ link: string; whatsappLink?: string | null } | null>(null);

  // Merge & Selection State
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeFormData, setMergeFormData] = useState({
    event_date: "",
    notes: "",
    status: "active"
  });
  const [savingMerge, setSavingMerge] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [editingDescId, setEditingDescId] = useState<number | null>(null);
  const [editingDescText, setEditingDescText] = useState("");

  useEffect(() => {
    const orderId = searchParams.get("id");
    if (orderId && !viewingOrderData) {
      viewOrder(parseInt(orderId));
    }
  }, [searchParams]);

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleMergeClick = () => {
    if (selectedIds.length !== 2) return;
    setMergeTargetId(selectedIds[0]);
    const target = orders.find(o => o.id === selectedIds[0]);
    if (target) {
      setMergeFormData({
        event_date: target.event_date ? target.event_date.split('T')[0] : "",
        notes: target.notes || "",
        status: target.status || "active"
      });
    }
    setShowMergeDialog(true);
  };

  const executeMerge = async () => {
    if (!mergeTargetId || selectedIds.length !== 2) return;
    const sourceId = selectedIds.find(id => id !== mergeTargetId);
    if (!sourceId) return;

    setSavingMerge(true);
    try {
      await ordersApi.merge(mergeTargetId, sourceId, mergeFormData);
      toast({ title: "הצלחה", description: "הזמנות אוחדו בהצלחה" });
      setShowMergeDialog(false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      mutate();
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה במיזוג",
        variant: "destructive",
      });
    } finally {
      setSavingMerge(false);
    }
  };

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: ordersRes, error, isLoading: loading, mutate } = useSWR(
    ["/api/orders", debouncedSearch, statusFilter, dateFrom, dateTo, sortBy, sortOrder],
    () => ordersApi.list({
      search: debouncedSearch || undefined,
      status: statusFilter || undefined,
      startDate: dateFrom || undefined,
      endDate: dateTo || undefined,
      sortBy: sortBy,
      sortOrder: sortOrder,
      page: 1,
      limit: 1000,
    })
  );

  const orders = ordersRes?.success && ordersRes.data ? (ordersRes.data as any).orders as Order[] : [];

  const handleStatusUpdate = async (orderId: number, status: string) => {
    mutate(
      async (currentData: any) => {
        const list = currentData?.data?.orders || [];
        const newOrders = list.map((o: any) => o.id === orderId ? { ...o, status } : o);
        return { ...currentData, data: { ...currentData?.data, orders: newOrders } };
      },
      { revalidate: false }
    );
    try {
      await ordersApi.updateStatus(orderId, status);
      toast({ title: "הצלחה", description: "סטטוס עודכן" });
    } catch (error) {
      toast({ title: "שגיאה", description: "שגיאה בעדכון", variant: "destructive" });
    } finally {
      mutate();
    }
  };

  const handleDelete = async (order: Order) => {
    if (!confirm("האם לבטל את ההזמנה?")) return;
    mutate(
      async (currentData: any) => {
        const list = currentData?.data?.orders || [];
        const newOrders = list.map((o: any) => o.id === order.id ? { ...o, status: "cancelled" } : o);
        return { ...currentData, data: { ...currentData?.data, orders: newOrders } };
      },
      { revalidate: false }
    );
    try {
      await ordersApi.delete(order.id);
      toast({ title: "הצלחה", description: "הזמנה בוטלה" });
    } catch (error) {
      toast({ title: "שגיאה", description: "שגיאה בביטול", variant: "destructive" });
    } finally {
      mutate();
    }
  };

  const viewOrder = async (orderId: number) => {
    setViewSignLink(null);
    setLoadingOrderDetails(true);
    try {
      const response = await ordersApi.get(orderId);
      if (response.success && response.data) {
        setViewingOrderData(response.data as OrderDetailData);
        fetchAttachments((response.data as OrderDetailData).order.id);
      }
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון פרטים", variant: "destructive" });
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  // Fetch attachments when viewing an order
  const fetchAttachments = async (orderId: number) => {
    setLoadingAttachments(true);
    try {
      const res = await ordersApi.getAttachments(orderId);
      if (res.success && res.data) {
        setAttachments((res.data as any).attachments || []);
      }
    } catch { /* silent */ } finally {
      setLoadingAttachments(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!viewingOrderData || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    setUploadingFiles(true);
    try {
      // Compress images client-side (max 2400px, JPEG q=0.92) before sending so
      // multipart payloads stay under the Vercel proxy body limit. PDFs pass
      // through untouched.
      const prepared = await prepareAttachmentsForUpload(files);
      await ordersApi.uploadAttachment(viewingOrderData.order.id, prepared);
      toast({ title: "הצלחה", description: `${prepared.length} קבצים הועלו` });
      fetchAttachments(viewingOrderData.order.id);
    } catch (error) {
      toast({ title: "שגיאה", description: error instanceof Error ? error.message : "שגיאה בהעלאה", variant: "destructive" });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!viewingOrderData || !confirm("למחוק קובץ זה?")) return;
    try {
      await ordersApi.deleteAttachment(viewingOrderData.order.id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      toast({ title: "הצלחה", description: "קובץ נמחק" });
    } catch {
      toast({ title: "שגיאה", description: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleSaveDescription = async (attachmentId: number) => {
    if (!viewingOrderData) return;
    try {
      await ordersApi.updateAttachment(viewingOrderData.order.id, attachmentId, { description: editingDescText });
      setAttachments(prev => prev.map(a => a.id === attachmentId ? { ...a, description: editingDescText } : a));
      setEditingDescId(null);
    } catch {
      toast({ title: "שגיאה", description: "שגיאה בעדכון תיאור", variant: "destructive" });
    }
  };

  const isImageMime = (mime: string | null) => mime?.startsWith("image/");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCreateSignLinkForViewedOrder = async (
    options?: { openWhatsapp?: boolean; copyToClipboard?: boolean }
  ): Promise<string | null> => {
    if (!viewingOrderData) return;

    const orderId = viewingOrderData.order.id;
    const shouldOpenWhatsapp = options?.openWhatsapp === true;
    const shouldCopyToClipboard = options?.copyToClipboard !== false;
    setCreatingSignLinkForOrderId(orderId);
    try {
      const response = await agreementsApi.createSignLink(orderId);
      if (!response.success || !response.data) {
        throw new Error(response.message || "לא ניתן ליצור קישור חתימה");
      }

      const data = response.data as { link: string; whatsappLink?: string | null };
      setViewSignLink({ link: data.link, whatsappLink: data.whatsappLink });

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
      setCreatingSignLinkForOrderId(null);
    }
  };

  const handleOpenImmediateSignForViewedOrder = async () => {
    if (!viewingOrderData) return;

    let link = viewSignLink?.link || "";
    if (!link) {
      const generatedLink = await handleCreateSignLinkForViewedOrder({ copyToClipboard: false });
      if (!generatedLink) return;
      link = generatedLink;
    }

    window.location.assign(link);
  };

  // Count shown in the top tile mirrors the current filter result (all loaded orders).
  const ordersCount = orders.length;

  const viewedAgreement = viewingOrderData?.agreement || null;
  const viewedAgreementSignedAt = viewedAgreement?.agreed_at || viewedAgreement?.created_at || null;
  const viewedOrderUpdatedAt = viewingOrderData?.order?.updated_at || null;
  const isViewedOrderCurrentlySigned = isOrderVersionSigned(viewedOrderUpdatedAt, viewedAgreementSignedAt);
  const viewedSignedAgreementPdfUrl = viewedAgreement?.pdf_url || null;

  // Financial Summary Calculations
  const ordersSummary = orders.filter(o => o.status !== 'cancelled').reduce((acc, o) => {
    const totalWithCharges = o.total_price + (o.total_customer_charge || 0);
    const balance = totalWithCharges - o.paid_amount;

    acc.totalAmount += totalWithCharges;
    acc.totalPaid += o.paid_amount;
    if (balance > 0) acc.totalDebt += balance;
    if (balance < 0) acc.totalCredit += Math.abs(balance);

    return acc;
  }, { totalAmount: 0, totalPaid: 0, totalDebt: 0, totalCredit: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Header Section */}
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black">ההזמנות <span className="text-green-600">שלי</span></h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1">מרכז הבקרה על ההשכרות</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isSelectionMode ? "secondary" : "outline"}
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedIds([]);
            }}
            size="sm"
            className="h-10 px-3 rounded-xl border-2 font-bold text-xs sm:text-sm"
          >
            {isSelectionMode ? "ביטול" : "מיזוג"}
          </Button>
          <Button
            onClick={() => router.push('/dashboard/orders/new')}
            size="sm"
            className="h-10 px-4 rounded-xl shadow-md bg-green-600 hover:bg-green-700 text-xs sm:text-sm font-bold gap-1"
          >
            <Plus className="h-4 w-4" />
            <span>הזמנה חדשה</span>
          </Button>
        </div>
      </div>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-primary" />
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase mb-1">הזמנות</p>
            <div className="flex items-baseline gap-1 sm:gap-2">
              <span className="text-lg sm:text-2xl font-black">{ordersCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-green-500" />
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase mb-1">סה&quot;כ הכנסות</p>
            <div className="text-lg sm:text-2xl font-black text-green-600">{formatCurrency(ordersSummary.totalPaid)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-orange-500" />
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase mb-1">חובות לקוחות</p>
            <div className="text-lg sm:text-2xl font-black text-orange-600">{formatCurrency(ordersSummary.totalDebt)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-blue-500" />
          <CardContent className="p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase mb-1">יתרות זכות</p>
            <div className="text-lg sm:text-2xl font-black text-blue-600">{formatCurrency(ordersSummary.totalCredit)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש לקוחה או הזמנה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 pr-10 rounded-xl bg-white border-none shadow-sm text-sm sm:text-base"
        />
      </div>

      {/* Filters Section */}
      <div className="bg-white p-4 rounded-[2rem] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>
          <div className="flex gap-2 w-full">
            <div className="flex-1 min-w-0">
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [col, dir] = e.target.value.split('-');
                  setSortBy(col);
                  setSortOrder(dir);
                }}
                className="w-full h-10 px-2 sm:px-4 rounded-xl border-2 bg-background font-bold text-xs sm:text-sm"
              >
                <option value="event_date-desc">קרובים תחילה</option>
                <option value="event_date-asc">רחוקים תחילה</option>
                <option value="customer_name-asc">שם הלקוחה</option>
                <option value="last_active_date-desc">פעילות אחרונה</option>
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 px-2 sm:px-4 rounded-xl border-2 bg-background font-bold text-xs sm:text-sm"
              >
                <option value="">כל הסטטוסים</option>
                <option value="open">פתוחה</option>
                <option value="completed">הושלמה</option>
                <option value="cancelled">בוטלה</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] shadow-inner">
            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-xl font-bold text-muted-foreground">לא נמצאו הזמנות</h3>
          </div>
        ) : (
          orders.map((order) => {
            const totalWithCharges = order.total_price + (order.total_customer_charge || 0);
            const balance = totalWithCharges - order.paid_amount;
            const isFullyPaid = balance === 0;
            const hasDebt = balance > 0;
            const hasCredit = balance < 0;

            return (
              <div key={order.id} className="relative group">
                {isSelectionMode && (
                  <div
                    className={cn(
                      "absolute top-4 right-4 z-10 h-6 w-6 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-white",
                      selectedIds.includes(order.id) ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/30"
                    )}
                    onClick={() => toggleSelection(order.id)}
                  >
                    {selectedIds.includes(order.id) && <Check className="h-4 w-4" />}
                  </div>
                )}
                <Card
                  onClick={() => isSelectionMode ? toggleSelection(order.id) : viewOrder(order.id)}
                  className={cn(
                    "rounded-2xl border-2 shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer",
                    order.status === "cancelled" ? "border-muted opacity-50 grayscale" : "border-muted hover:border-green-300 bg-white",
                    selectedIds.includes(order.id) && "ring-2 ring-green-600 border-green-600 bg-green-50/50"
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      {/* Customer & Status Info */}
                      <div className="p-4 md:p-5 md:w-1/2 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">הזמנה #{order.id}</span>
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase", getStatusColor(computeOrderDisplayStatus(order)))}>
                                {getStatusLabel(computeOrderDisplayStatus(order))}
                              </span>
                            </div>
                            
                            {!isSelectionMode && (
                              <div className="flex items-center gap-1 -mt-1 -mr-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/orders/${order.id}/edit`); }}
                                  title="עריכה"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {order.status !== "cancelled" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(order); }}
                                    title="ביטול"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-xl font-black">{order.customer_name}</h3>
                            {order.event_date && (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDateShort(order.event_date)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <p className="text-sm font-medium text-muted-foreground">{formatPhoneNumber(order.customer_phone)}</p>
                            {order.customer_phone && (
                              <a
                                href={createWhatsAppLink(order.customer_phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-6 w-6 bg-green-500 hover:bg-green-600 justify-center text-white rounded-full flex items-center transition-colors shadow-sm"
                                title="שלחי הודעת וואטסאפ"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageCircle className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                          {order.order_summary && (
                            <div className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded-lg">
                              {order.order_summary}
                            </div>
                          )}
                          {order.notes && (
                            <div className="text-[10px] font-bold text-orange-600 px-2 py-0.5 bg-orange-50 rounded-lg flex items-center gap-1" title={order.notes}>
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="leading-tight">{order.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Financial Summary Section */}
                      <div className="p-4 md:p-5 md:w-1/2 flex flex-row justify-between items-center bg-muted/5 md:border-r border-t md:border-t-0">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">סה&quot;כ לתשלום</p>
                            <div className="text-sm sm:text-base font-black flex flex-col">
                              {formatCurrency(totalWithCharges)}
                              {(order.total_customer_charge > 0) && (
                                <span className="text-[9px] font-bold text-orange-600 mt-0.5">
                                  (כולל {formatCurrency(order.total_customer_charge)})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">שולם בפועל</p>
                            <div className="text-sm sm:text-base font-black text-green-600">{formatCurrency(order.paid_amount)}</div>
                          </div>
                        </div>

                        <div className={cn(
                          "px-3 py-2 rounded-xl flex items-center gap-2",
                          isFullyPaid ? "bg-green-50 border border-green-100" :
                            hasDebt ? "bg-orange-50 border border-orange-100" :
                              "bg-blue-50 border border-blue-100"
                        )}>
                          <div>
                            <p className="text-[9px] font-black uppercase opacity-60">
                              {isFullyPaid ? "שולם במלואו" : hasDebt ? "יתרת חוב" : "יתרת זכות"}
                            </p>
                            <p className={cn(
                              "text-sm sm:text-lg font-black",
                              isFullyPaid ? "text-green-700" : hasDebt ? "text-orange-700" : "text-blue-700"
                            )}>
                              {formatCurrency(Math.abs(balance))}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Merge Button */}
      {isSelectionMode && selectedIds.length === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <Button
            onClick={handleMergeClick}
            className="h-14 px-8 rounded-full shadow-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg gap-2"
          >
            <Link2 className="h-5 w-5" />
            מיזוג 2 הזמנות שנבחרו
          </Button>
        </div>
      )}

      {/* Merge Dialog */}
      {showMergeDialog && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem]">
            <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-2xl font-black text-purple-700">איחוד הזמנות</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMergeDialog(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="bg-purple-50 p-4 rounded-xl text-purple-800 text-sm font-medium">
                שימי לב: פעולה זו תאחד את כל הפריטים, התשלומים וההיסטוריה של שתי ההזמנות להזמנה אחת. ההזמנה השנייה תימחק.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedIds.map(id => {
                  const o = orders.find(ord => ord.id === id);
                  if (!o) return null;
                  const isTarget = mergeTargetId === id;
                  return (
                    <div
                      key={id}
                      onClick={() => {
                        setMergeTargetId(id);
                        setMergeFormData({
                          event_date: o.event_date ? o.event_date.split('T')[0] : "",
                          notes: o.notes || "",
                          status: o.status || "active"
                        });
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
                        isTarget ? "border-purple-600 bg-purple-50" : "border-muted hover:border-purple-300"
                      )}
                    >
                      {isTarget && (
                        <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-xl">
                          ההזמנה הראשית (תישמר)
                        </div>
                      )}
                      <h3 className="font-bold text-lg mb-1">הזמנה #{o.id}</h3>
                      <p className="text-sm font-bold">{o.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{o.event_date ? formatDateShort(o.event_date) : "ללא תאריך"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatCurrency(o.total_price)}</p>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold mb-4">עריכת פרטים סופיים להזמנה המאוחדת:</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold">תאריך אירוע</label>
                    <input
                      type="date"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={mergeFormData.event_date}
                      onChange={e => setMergeFormData({ ...mergeFormData, event_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">סטטוס</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={mergeFormData.status}
                      onChange={e => setMergeFormData({ ...mergeFormData, status: e.target.value })}
                    >
                      <option value="active">פעילה</option>
                      <option value="cancelled">בוטלה</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">הערות (יחליף את הקיים)</label>
                    <textarea
                      className="w-full h-24 p-3 border rounded-xl"
                      value={mergeFormData.notes}
                      onChange={e => setMergeFormData({ ...mergeFormData, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setShowMergeDialog(false)}>ביטול</Button>
                <Button
                  className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 font-bold"
                  onClick={executeMerge}
                  disabled={savingMerge}
                >
                  {savingMerge ? "מאחד..." : "אשרי וסיימי איחוד"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Order Detail Modal */}
      {viewingOrderData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-white flex flex-col">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                  <Eye className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-black text-xl">פרטי הזמנה #{viewingOrderData.order.id}</h2>
                  <p className="text-xs text-muted-foreground">תאריך יצירה: {formatDateShort(viewingOrderData.order.created_at)}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingOrderData(null)} className="rounded-full h-10 w-10">
                <X className="h-6 w-6" />
              </Button>
            </div>

            <CardContent className="p-0 overflow-y-auto">
              <div className="p-6 space-y-8">
                {/* Customer Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-muted cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                    onClick={() => {
                      setViewingOrderData(null);
                      router.push(`/dashboard/customers?editId=${viewingOrderData.order.customer_id}`);
                    }}
                  >
                    <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-3">פרטי לקוחה</h4>
                    <p className="font-black text-xl mb-1">{viewingOrderData.order.customer_name}</p>
                    <p className="text-sm font-medium mb-1">{formatPhoneNumber(viewingOrderData.order.customer_phone)}</p>
                  </div>
                  <div className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-muted">
                    <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-3">פרטי אירוע</h4>
                    <div className="flex items-center justify-between">
                      <p className="font-black text-xl">{viewingOrderData.order.event_date ? formatDateShort(viewingOrderData.order.event_date) : "לא הוזן"}</p>
                      <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase", getStatusColor(computeOrderDisplayStatus(viewingOrderData.order)))}>
                        {getStatusLabel(computeOrderDisplayStatus(viewingOrderData.order))}
                      </span>
                    </div>
                    {viewingOrderData.order.order_summary && (
                      <p className="text-xs text-muted-foreground mt-2">{viewingOrderData.order.order_summary}</p>
                    )}
                    {viewingOrderData.order.notes && (
                      <div className="mt-3 p-3 bg-orange-50 text-orange-800 rounded-xl border border-orange-100 flex items-start gap-2">
                        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-orange-600" />
                        <p className="text-sm font-medium whitespace-pre-wrap">{viewingOrderData.order.notes}</p>
                      </div>
                    )}
                    {!viewingOrderData.order.order_summary && !viewingOrderData.order.notes && (
                      <p className="text-xs text-muted-foreground mt-2">אין טקסט חופשי</p>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">פירוט פריטים</h4>
                    <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded-full">{viewingOrderData.items.length} פריטים</span>
                  </div>
                  <div className="space-y-2">
                    {viewingOrderData.items.map((it, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-4 bg-white border-2 rounded-2xl shadow-sm space-y-2",
                          it.dress_id && "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                        )}
                        onClick={() => {
                          if (it.dress_id) {
                            setViewingOrderData(null);
                            router.push(`/dashboard/dresses?id=${it.dress_id}`);
                          }
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-muted rounded-xl flex items-center justify-center">
                              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-black text-sm leading-snug break-words whitespace-normal">{it.dress_name}</p>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">{getItemTypeLabel(it.item_type)} {it.wearer_name && `• ${it.wearer_name}`}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-primary">{formatCurrency(it.final_price || 0)}</p>
                            {(it.additional_payments > 0) && (
                              <p className="text-[9px] font-bold text-muted-foreground">בסיס: {formatCurrency(it.base_price || 0)} + {formatCurrency(it.additional_payments || 0)}</p>
                            )}
                          </div>
                        </div>
                        {it.notes && (
                          <p className="text-xs text-muted-foreground border-t pt-2 break-words whitespace-pre-wrap">📝 {it.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Overview - Detailed */}
                <div
                  className="bg-green-50 p-6 rounded-[2rem] border-2 border-green-100 space-y-4 cursor-pointer hover:ring-2 hover:ring-green-400/40 transition-all"
                  onClick={() => {
                    setViewingOrderData(null);
                    router.push(`/dashboard/transactions?customerId=${viewingOrderData.order.customer_id}&customerName=${encodeURIComponent(viewingOrderData.order.customer_name)}`);
                  }}
                >
                  <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest text-center">סיכום כספי מפורט</h4>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">סך פריטים:</span>
                      <span className="font-bold">{formatCurrency(Number(viewingOrderData.order.total_price || 0))}</span>
                    </div>
                    {Number(viewingOrderData.order.total_customer_charge || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600 font-medium">הוצאות על חשבון לקוחה:</span>
                        <span className="font-bold text-orange-600">+{formatCurrency(Number(viewingOrderData.order.total_customer_charge || 0))}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="font-black">סה&quot;כ לתשלום:</span>
                      <span className="font-black text-xl text-green-600">{formatCurrency(Number(viewingOrderData.order.total_price || 0) + Number(viewingOrderData.order.total_customer_charge || 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600 pt-1">
                      <span className="font-medium">שולם עד כה:</span>
                      <span className="font-bold">-{formatCurrency(Number(viewingOrderData.order.paid_amount || 0))}</span>
                    </div>
                  </div>

                  <div className={cn(
                    "p-4 rounded-2xl flex flex-col items-center justify-center text-center",
                    (Number(viewingOrderData.order.total_price || 0) + Number(viewingOrderData.order.total_customer_charge || 0) - Number(viewingOrderData.order.paid_amount || 0)) <= 0 ? "bg-green-500 text-white shadow-lg shadow-green-500/20" : "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                  )}>
                    <p className="text-[10px] font-black uppercase opacity-80">
                      {(Number(viewingOrderData.order.total_price || 0) + Number(viewingOrderData.order.total_customer_charge || 0) - Number(viewingOrderData.order.paid_amount || 0)) <= 0 ? "הזמנה סגורה" : "יתרה לתשלום"}
                    </p>
                    <p className="text-3xl font-black">
                      {formatCurrency(Math.abs(Number(viewingOrderData.order.total_price || 0) + Number(viewingOrderData.order.total_customer_charge || 0) - Number(viewingOrderData.order.paid_amount || 0)))}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-muted/20 rounded-[1.5rem] border-2 border-muted space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <Link2 className="h-4 w-4" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest">חתימה דיגיטלית ללקוחה</h4>
                  </div>
                  {viewSignLink?.link && !isViewedOrderCurrentlySigned && (
                    <p className="text-xs break-all bg-white border rounded-lg p-2">{viewSignLink.link}</p>
                  )}
                  {isViewedOrderCurrentlySigned ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (!viewedSignedAgreementPdfUrl) return;
                        window.open(viewedSignedAgreementPdfUrl, "_blank", "noopener,noreferrer");
                      }}
                      disabled={!viewedSignedAgreementPdfUrl}
                      className="w-full h-10 px-2 text-[10px] sm:text-xs font-bold bg-green-600 hover:bg-green-700"
                    >
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                      צפיה בחתימה
                    </Button>
                  ) : (
                    <>
                      {viewedSignedAgreementPdfUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => window.open(viewedSignedAgreementPdfUrl, "_blank", "noopener,noreferrer")}
                          className="w-full h-10 px-2 text-[10px] sm:text-xs font-bold"
                        >
                          <FileText className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                          צפיה בחתימה
                        </Button>
                      )}
                      <div className="flex flex-row items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleCreateSignLinkForViewedOrder()}
                          disabled={creatingSignLinkForOrderId === viewingOrderData.order.id}
                          className="flex-1 h-10 px-2 text-[10px] sm:text-xs font-bold"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                          {creatingSignLinkForOrderId === viewingOrderData.order.id ? "יוצר קישור..." : "העתקת קישור"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleOpenImmediateSignForViewedOrder}
                          disabled={creatingSignLinkForOrderId === viewingOrderData.order.id}
                          className="flex-1 h-10 px-2 text-[10px] sm:text-xs font-bold"
                        >
                          <FileSignature className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                          חתימה
                        </Button>
                        <Button
                          onClick={() => handleCreateSignLinkForViewedOrder({ openWhatsapp: true })}
                          disabled={creatingSignLinkForOrderId === viewingOrderData.order.id}
                          className="flex-1 bg-green-600 hover:bg-green-700 h-10 px-2 text-[10px] sm:text-xs font-bold"
                        >
                          <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5" />
                          שליחה בווצאפ
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {/* Attachments Section */}
                <div className="p-5 bg-muted/20 rounded-[1.5rem] border-2 border-muted space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-700">
                      <Paperclip className="h-4 w-4" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest">קבצים מצורפים</h4>
                      {attachments.length > 0 && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{attachments.length}</span>
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
                    <p className="text-center text-xs text-muted-foreground py-4">טוען קבצים...</p>
                  ) : attachments.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-4 italic">אין קבצים מצורפים להזמנה זו</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-3 p-3 bg-white border-2 rounded-2xl">
                          {/* Preview / Icon */}
                          {isImageMime(att.mime_type) ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              <img src={att.url} alt={att.original_name} className="h-14 w-14 object-cover rounded-xl border" />
                            </a>
                          ) : (
                            <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}

                          {/* Name / Description */}
                          <div className="flex-1 min-w-0">
                            {editingDescId === att.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={editingDescText}
                                  onChange={(e) => setEditingDescText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveDescription(att.id); if (e.key === "Escape") setEditingDescId(null); }}
                                  className="flex-1 h-8 px-2 text-sm border rounded-lg"
                                  placeholder="תיאור הקובץ..."
                                />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveDescription(att.id)}><Check className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingDescId(null)}><X className="h-3.5 w-3.5" /></Button>
                              </div>
                            ) : (
                              <p
                                className="font-bold text-sm truncate cursor-pointer hover:text-green-600 transition-colors"
                                title="לחצי לעריכת תיאור"
                                onClick={() => { setEditingDescId(att.id); setEditingDescText(att.description || att.original_name); }}
                              >
                                {att.description || att.original_name}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground">{formatFileSize(att.size_bytes)}</p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 shrink-0">
                            <a
                              href={ordersApi.attachmentDownloadUrl(viewingOrderData.order.id, att.id)}
                              download
                              className="h-8 w-8 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-green-600 hover:border-green-300 transition-colors"
                              title="הורדה"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteAttachment(att.id)} title="מחיקה">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>

            <div className="p-6 border-t bg-muted/10 grid grid-cols-2 gap-3 sticky bottom-0">
              <Button
                className="h-14 rounded-2xl font-black text-lg shadow-lg shadow-green-600/20 bg-green-600 hover:bg-green-700"
                onClick={() => router.push(`/dashboard/orders/${viewingOrderData.order.id}/edit`)}
              >
                <Edit className="h-5 w-5 ml-2" /> עריכה מלאה
              </Button>
              <Button
                variant="outline"
                className="h-14 rounded-2xl font-black text-lg border-2 bg-white"
                onClick={() => router.push(`/dashboard/transactions/new?type=income&order_id=${viewingOrderData.order.id}&customer_id=${viewingOrderData.order.customer_id}&amount=${Number(viewingOrderData.order.total_price || 0) + Number(viewingOrderData.order.total_customer_charge || 0) - Number(viewingOrderData.order.paid_amount || 0)}`)}
              >
                <Plus className="h-5 w-5 ml-2" /> הוספת תשלום
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
