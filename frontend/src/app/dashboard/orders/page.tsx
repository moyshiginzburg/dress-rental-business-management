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
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useRouter, useSearchParams } from "next/navigation";
import { ordersApi, agreementsApi } from "@/lib/api";
import {
  formatCurrency,
  formatDateShort,
  getStatusLabel,
  getStatusColor,
  createWhatsAppLink,
  formatPhoneNumber,
  cn,
} from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
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
  source?: string | null;
  created_at: string;
}

interface OrderDetailData {
  order: Order;
  items: any[];
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

export default function OrdersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  
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
      fetchOrders();
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

  const fetchOrders = useCallback(async () => {
    try {
      const response = await ordersApi.list({
        status: statusFilter || undefined,
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined,
        page: 1,
        limit: 1000,
      });
      if (response.success && response.data) {
        setOrders((response.data as any).orders);
      }
    } catch (error) {
      console.error("Failed to load orders:", error);
      toast({ title: "שגיאה", description: "לא ניתן לטעון את ההזמנות", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusUpdate = async (orderId: number, status: string) => {
    try {
      await ordersApi.updateStatus(orderId, status);
      toast({ title: "הצלחה", description: "סטטוס עודכן" });
      fetchOrders();
    } catch (error) {
      toast({ title: "שגיאה", description: "שגיאה בעדכון", variant: "destructive" });
    }
  };

  const handleDelete = async (order: Order) => {
    if (!confirm("האם לבטל את ההזמנה?")) return;
    try {
      await ordersApi.delete(order.id);
      toast({ title: "הצלחה", description: "הזמנה בוטלה" });
      fetchOrders();
    } catch (error) {
      toast({ title: "שגיאה", description: "שגיאה בביטול", variant: "destructive" });
    }
  };

  const viewOrder = async (orderId: number) => {
    setViewSignLink(null);
    setLoadingOrderDetails(true);
    try {
      const response = await ordersApi.get(orderId);
      if (response.success && response.data) {
        setViewingOrderData(response.data as OrderDetailData);
      }
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון פרטים", variant: "destructive" });
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const handleCreateSignLinkForViewedOrder = async (openWhatsapp: boolean) => {
    if (!viewingOrderData) return;

    const orderId = viewingOrderData.order.id;
    setCreatingSignLinkForOrderId(orderId);
    try {
      const response = await agreementsApi.createSignLink(orderId);
      if (!response.success || !response.data) {
        throw new Error(response.message || "לא ניתן ליצור קישור חתימה");
      }

      const data = response.data as { link: string; whatsappLink?: string | null };
      setViewSignLink({ link: data.link, whatsappLink: data.whatsappLink });

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
      setCreatingSignLinkForOrderId(null);
    }
  };

  const activeOrdersCount = orders.filter((o) => o.status === "active").length;
  
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <ShoppingBag className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">ניהול הזמנות</span>
          </div>
          <h1 className="text-4xl font-black">ההזמנות <span className="text-green-600">שלי</span></h1>
          <p className="text-muted-foreground font-medium mt-1">מרכז הבקרה על כל ההשכרות והתפירות</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={isSelectionMode ? "secondary" : "outline"}
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedIds([]);
            }}
            className="h-14 px-4 rounded-2xl border-2 font-bold"
          >
            {isSelectionMode ? "ביטול בחירה" : "בחירה מרובה"}
          </Button>
          <Button 
            onClick={() => router.push('/dashboard/orders/new')} 
            className="h-14 px-8 rounded-2xl shadow-xl shadow-green-500/20 bg-green-600 hover:bg-green-700 text-lg font-bold gap-2"
          >
            <Plus className="h-6 w-6" />
            הזמנה חדשה
          </Button>
        </div>
      </div>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-primary" />
          <CardContent className="p-6">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">הזמנות פעילות</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black">{activeOrdersCount}</span>
              <span className="text-muted-foreground text-sm">הזמנות</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-green-500" />
          <CardContent className="p-6">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">סה&quot;כ הכנסות</p>
            <div className="text-3xl font-black text-green-600">{formatCurrency(ordersSummary.totalPaid)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-orange-500" />
          <CardContent className="p-6">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">חובות לקוחות</p>
            <div className="text-3xl font-black text-orange-600">{formatCurrency(ordersSummary.totalDebt)}</div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
          <div className="h-1 w-full bg-blue-500" />
          <CardContent className="p-6">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">יתרות זכות</p>
            <div className="text-3xl font-black text-blue-600">{formatCurrency(ordersSummary.totalCredit)}</div>
          </CardContent>
        </Card>
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
          <div className="w-full md:w-48">
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)} 
              className="w-full h-12 px-4 rounded-xl border-2 bg-background font-bold text-sm"
            >
              <option value="">כל הסטטוסים</option>
              <option value="active">פעילה</option>
              <option value="cancelled">בוטלה</option>
            </select>
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
                  onClick={() => isSelectionMode && toggleSelection(order.id)}
                  className={cn(
                    "rounded-[2rem] border-none shadow-sm overflow-hidden transition-all hover:shadow-md",
                    order.status === "cancelled" ? "opacity-50 grayscale" : "bg-white",
                    isSelectionMode && "cursor-pointer hover:ring-2 hover:ring-green-500/50",
                    selectedIds.includes(order.id) && "ring-2 ring-green-600 bg-green-50/50"
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col lg:flex-row">
                      {/* Customer & Status Info */}
                      <div className="p-6 lg:w-1/3 border-b lg:border-b-0 lg:border-l flex flex-col justify-between bg-muted/10">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">הזמנה #{order.id}</span>
                            <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase", getStatusColor(order.status))}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <h3 className="text-2xl font-black mb-1">{order.customer_name}</h3>
                          <p className="text-sm font-medium text-muted-foreground mb-4">{formatPhoneNumber(order.customer_phone)}</p>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-auto pt-4 border-t border-muted">
                          {order.event_date && (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDateShort(order.event_date)}
                            </div>
                          )}
                          {order.order_summary && (
                            <>
                              <span className="mx-1 text-muted-foreground/30">•</span>
                              <div className="text-xs font-bold text-primary px-2 py-0.5 bg-primary/5 rounded-lg truncate max-w-[200px]">
                                {order.order_summary}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Financial Summary Section */}
                      <div className="p-6 lg:w-2/5 flex flex-col justify-center gap-6 border-b lg:border-b-0 lg:border-l">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">סה&quot;כ לתשלום</p>
                            <div className="text-xl font-black flex flex-col">
                              {formatCurrency(totalWithCharges)}
                              {(order.total_customer_charge > 0) && (
                                <span className="text-[9px] font-bold text-orange-600 mt-0.5">
                                  (כולל {formatCurrency(order.total_customer_charge)} הוצאות)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">שולם בפועל</p>
                            <div className="text-xl font-black text-green-600">{formatCurrency(order.paid_amount)}</div>
                          </div>
                        </div>

                        <div className={cn(
                          "p-4 rounded-2xl flex items-center justify-between",
                          isFullyPaid ? "bg-green-50 border border-green-100" :
                          hasDebt ? "bg-orange-50 border border-orange-100" :
                          "bg-blue-50 border border-blue-100"
                        )}>
                          <div>
                            <p className="text-[10px] font-black uppercase opacity-60">
                              {isFullyPaid ? "שולם במלואו" : hasDebt ? "יתרת חוב" : "יתרת זכות"}
                            </p>
                            <p className={cn(
                              "text-2xl font-black",
                              isFullyPaid ? "text-green-700" : hasDebt ? "text-orange-700" : "text-blue-700"
                            )}>
                              {formatCurrency(Math.abs(balance))}
                            </p>
                          </div>
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center",
                            isFullyPaid ? "bg-green-200/50 text-green-700" :
                            hasDebt ? "bg-orange-200/50 text-orange-700" :
                            "bg-blue-200/50 text-blue-700"
                          )}>
                            <CreditCard className="h-5 w-5" />
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isSelectionMode && (
                        <div className="p-6 lg:w-1/4 flex flex-row lg:flex-col justify-center items-center gap-3 bg-muted/5">
                          <Button 
                            variant="outline" 
                            size="lg" 
                            onClick={() => viewOrder(order.id)} 
                            className="flex-1 lg:w-full rounded-2xl font-bold h-12 border-2 hover:bg-white"
                          >
                            <Eye className="h-5 w-5 ml-2" /> צפייה
                          </Button>
                          <Button 
                            variant="outline" 
                            size="lg" 
                            onClick={() => router.push(`/dashboard/orders/${order.id}/edit`)} 
                            className="flex-1 lg:w-full rounded-2xl font-bold h-12 border-2 border-primary/20 text-primary hover:bg-primary/5"
                          >
                            <Edit className="h-5 w-5 ml-2" /> עריכה
                          </Button>
                          <div className="flex gap-2 w-full">
                            {order.customer_phone && (
                              <a 
                                href={createWhatsAppLink(order.customer_phone)} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex-1 lg:w-auto h-12 bg-green-500 hover:bg-green-600 text-white rounded-2xl flex items-center justify-center transition-colors shadow-lg shadow-green-500/20"
                              >
                                <MessageCircle className="h-6 w-6" />
                              </a>
                            )}
                            {order.status !== "cancelled" && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(order)} 
                                className="h-12 w-12 rounded-2xl text-destructive hover:bg-destructive/5"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
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
                      onChange={e => setMergeFormData({...mergeFormData, event_date: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">סטטוס</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={mergeFormData.status}
                      onChange={e => setMergeFormData({...mergeFormData, status: e.target.value})}
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
                      onChange={e => setMergeFormData({...mergeFormData, notes: e.target.value})} 
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
                  <div className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-muted">
                    <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-3">פרטי לקוחה</h4>
                    <p className="font-black text-xl mb-1">{viewingOrderData.order.customer_name}</p>
                    <p className="text-sm font-medium mb-1">{formatPhoneNumber(viewingOrderData.order.customer_phone)}</p>
                  </div>
                  <div className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-muted">
                    <h4 className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-3">פרטי אירוע</h4>
                    <div className="flex items-center justify-between">
                      <p className="font-black text-xl">{viewingOrderData.order.event_date ? formatDateShort(viewingOrderData.order.event_date) : "לא הוזן"}</p>
                      <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase", getStatusColor(viewingOrderData.order.status))}>
                        {getStatusLabel(viewingOrderData.order.status)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{viewingOrderData.order.order_summary || "אין פירוט נוסף"}</p>
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
                      <div key={idx} className="flex justify-between items-center p-4 bg-white border-2 rounded-2xl shadow-sm">
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
                    ))}
                  </div>
                </div>

                {/* Financial Overview - Detailed */}
                <div className="bg-green-50 p-6 rounded-[2rem] border-2 border-green-100 space-y-4">
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
                  {viewSignLink?.link && (
                    <p className="text-xs break-all bg-white border rounded-lg p-2">{viewSignLink.link}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleCreateSignLinkForViewedOrder(false)}
                      disabled={creatingSignLinkForOrderId === viewingOrderData.order.id}
                    >
                      <Copy className="h-4 w-4 ml-2" />
                      {creatingSignLinkForOrderId === viewingOrderData.order.id ? "יוצר קישור..." : "יצירה והעתקה"}
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleCreateSignLinkForViewedOrder(true)}
                      disabled={creatingSignLinkForOrderId === viewingOrderData.order.id}
                    >
                      <MessageCircle className="h-4 w-4 ml-2" />
                      שליחה לוואטסאפ
                    </Button>
                  </div>
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
