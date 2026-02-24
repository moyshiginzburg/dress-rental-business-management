"use client";

/**
 * Dresses Management Page - Enhanced for Mobile
 * 
 * Purpose: Display dress inventory as a beautiful, high-end catalog.
 * Features: Visual grid, quick actions, status badges, and full inventory view.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dressesApi } from "@/lib/api";
import {
  cn,
  formatCurrency,
  formatDateShort,
  getStatusLabel,
} from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  ShoppingBag,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Calendar,
  TrendingUp,
  History,
  Sparkles,
} from "lucide-react";
import { base64ToFile, clearSharedUploadPayload, getSharedUploadPayload, type SharedUploadPayload } from "@/lib/shared-upload";

interface Dress {
  id: number;
  name: string;
  base_price: number;
  total_income: number;
  rental_count: number;
  status: string;
  intended_use: "rental" | "sale";
  photo_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
}

interface RentalHistory {
  id: number;
  order_id: number | null;
  customer_full_name: string; // The account holder (from JOIN to customers)
  customer_name: string;      // The account holder (from dress_history.customer_name)
  wearer_name: string;        // The wearer (from dress_history.wearer_name)
  customer_phone: string;
  amount: number;
  rental_type: string;
  event_date: string;
  created_at: string;
}

interface DressDetailData {
  dress: Dress;
  rentals: RentalHistory[];
  upcoming_bookings: Array<{
    order_id: number;
    event_date: string;
    order_status: string;
    customer_name: string | null;
    customer_phone: string | null;
    item_type: string;
    wearer_name: string | null;
  }>;
  stats: {
    totalIncome: number;
    rentalCount: number;
    averagePrice: number;
  };
}

interface DressFormData {
  name: string;
  base_price: string;
  status: string;
  intended_use: "rental" | "sale";
  photo_url: string;
  thumbnail_url: string;
  notes: string;
}

function getIntendedUseLabel(intendedUse: "rental" | "sale" | null | undefined) {
  return intendedUse === "sale" ? "מיועדת למכירה" : "מיועדת להשכרה";
}

function isDressBookable(status: string) {
  return status !== "sold" && status !== "retired";
}

export default function DressesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [intendedUseFilter, setIntendedUseFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<string>("asc");
  const [showForm, setShowForm] = useState(false);
  const [editingDress, setEditingDress] = useState<Dress | null>(null);

  const [viewingDress, setViewingDress] = useState<DressDetailData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [formData, setFormData] = useState<DressFormData>({
    name: "",
    base_price: "",
    status: "available",
    intended_use: "rental",
    photo_url: "",
    thumbnail_url: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [sharedUploadPayload, setSharedUploadPayload] = useState<SharedUploadPayload | null>(null);
  const [sharedMode, setSharedMode] = useState<"dress_add" | "dress_edit" | null>(null);
  const [sharedFlowApplied, setSharedFlowApplied] = useState(false);

  const applySharedImageToForm = useCallback(async (payload: SharedUploadPayload) => {
    const file = base64ToFile(payload.base64, payload.fileName, payload.mimeType);
    setSaving(true);
    try {
      const res = await dressesApi.uploadImage(file);
      if (res.success && res.data) {
        setFormData((prev) => ({
          ...prev,
          photo_url: res.data!.imageUrl,
          thumbnail_url: res.data!.thumbnailUrl
        }));
        clearSharedUploadPayload();
        setSharedUploadPayload(null);
        setSharedMode(null);
        toast({ title: "התמונה נטענה", description: "אפשר להמשיך למלא ולשמור את הטופס." });
      }
    } catch (error) {
      toast({ title: "שגיאה", description: "טעינת התמונה מהשיתוף נכשלה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  const fetchDresses = useCallback(
    async (
      searchQuery: string = "",
      status: string = "",
      intendedUse: string = "",
      sort: string = "name",
      order: string = "asc"
    ) => {
      try {
        const response = await dressesApi.list({
          search: searchQuery,
          status: status || undefined,
          intended_use: intendedUse || undefined,
          sortBy: sort,
          sortOrder: order,
          limit: 1000, // Show everything
        });
        if (response.success && response.data) {
          const data = response.data as { dresses: Dress[] };
          setDresses(data.dresses);
        }
      } catch (error) {
        console.error("Failed to load dresses:", error);
        toast({
          title: "שגיאה",
          description: "לא ניתן לטעון את רשימת השמלות",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchDresses(search, statusFilter, intendedUseFilter, sortBy, sortOrder);
  }, [fetchDresses, search, statusFilter, intendedUseFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (sharedFlowApplied) return;
    if (searchParams.get("shared_upload") !== "1") return;

    const mode = searchParams.get("share_context");
    if (mode !== "dress_add" && mode !== "dress_edit") return;

    const payload = getSharedUploadPayload();
    if (!payload) {
      toast({ title: "שגיאה", description: "לא נמצא קובץ משותף", variant: "destructive" });
      setSharedFlowApplied(true);
      return;
    }

    setSharedUploadPayload(payload);
    setSharedMode(mode);
    setSharedFlowApplied(true);

    if (mode === "dress_add") {
      setEditingDress(null);
      setFormData({
        name: "",
        base_price: "",
        status: "available",
        intended_use: "rental",
        photo_url: "",
        thumbnail_url: "",
        notes: "",
      });
      setShowForm(true);
      applySharedImageToForm(payload);
      return;
    }

    toast({
      title: "בחרי שמלה לעדכון",
      description: "הקובץ המשותף מוכן. לחצי על שמלה כדי לפתוח עריכה ולעדכן לה תמונה.",
    });
  }, [applySharedImageToForm, searchParams, sharedFlowApplied, toast]);

  const viewDress = async (id: number) => {
    setLoadingDetails(true);
    try {
      const res = await dressesApi.get(id);
      if (res.success && res.data) {
        setViewingDress(res.data as DressDetailData);
      }
    } catch (e) {
      toast({ title: "שגיאה", description: "לא ניתן לטעון פרטי שמלה", variant: "destructive" });
    } finally {
      setLoadingDetails(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      base_price: "",
      status: "available",
      intended_use: "rental",
      photo_url: "",
      thumbnail_url: "",
      notes: "",
    });
    setEditingDress(null);
    setShowForm(false);
  };

  const handleEdit = (e: React.MouseEvent, dress: Dress) => {
    e.stopPropagation();
    setEditingDress(dress);
    setFormData({
      name: dress.name,
      base_price: dress.base_price?.toString() || "",
      status: dress.status,
      intended_use: dress.intended_use || "rental",
      photo_url: dress.photo_url || "",
      thumbnail_url: dress.thumbnail_url || "",
      notes: dress.notes || "",
    });
    setShowForm(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "שגיאה", description: "ניתן להעלות רק קובצי תמונה", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "שגיאה", description: "הקובץ גדול מדי (מקסימום 10MB)", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await dressesApi.uploadImage(file);
      if (res.success && res.data) {
        setFormData(prev => ({
          ...prev,
          photo_url: res.data!.imageUrl,
          thumbnail_url: res.data!.thumbnailUrl
        }));
        toast({ title: "הצלחה", description: "התמונה הועלתה בהצלחה" });
      }
    } catch (error) {
      toast({ title: "שגיאה", description: "העלאת תמונה נכשלה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "שגיאה", description: "נא להזין שם שמלה", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: formData.name,
        base_price: parseFloat(formData.base_price) || 0,
        status: formData.status,
        intended_use: formData.intended_use,
        photo_url: formData.photo_url || undefined,
        thumbnail_url: formData.thumbnail_url || undefined,
        notes: formData.notes || undefined,
      };

      if (editingDress) {
        await dressesApi.update(editingDress.id, data);
        toast({ title: "הצלחה", description: "שמלה עודכנה בהצלחה" });
      } else {
        await dressesApi.create(data);
        toast({ title: "הצלחה", description: "שמלה נוספה בהצלחה" });
      }
      resetForm();
      fetchDresses(search, statusFilter, intendedUseFilter, sortBy, sortOrder);
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בשמירת שמלה",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, dress: Dress) => {
    e.stopPropagation();
    if (!confirm(`האם למחוק את "${dress.name}"?`)) return;
    try {
      await dressesApi.delete(dress.id);
      toast({ title: "הצלחה", description: "שמלה נמחקה בהצלחה" });
      fetchDresses(search, statusFilter, intendedUseFilter, sortBy, sortOrder);
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
    }
  };

  const bookableCount = dresses.filter((dress) => isDressBookable(dress.status)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">קולקציה</span>
            </div>
            <h1 className="text-3xl font-black">מלאי <span className="text-primary">שמלות</span></h1>
            <p className="text-muted-foreground text-sm font-medium">
              {dresses.length} שמלות במערכת • {bookableCount} פעילות במלאי
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20">
            <Plus className="h-5 w-5 ml-2" />
            שמלה
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 pr-12 rounded-2xl bg-white border-none shadow-sm text-lg"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-12 px-3 rounded-2xl bg-white border-none shadow-sm font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none min-w-0"
            >
              <option value="">כל הסטטוסים</option>
              <option value="available">פנויה</option>
              <option value="sold">נמכרה</option>
              <option value="retired">הוצאה מהמלאי</option>
            </select>
            <select
              value={intendedUseFilter}
              onChange={(e) => setIntendedUseFilter(e.target.value)}
              className="h-12 px-3 rounded-2xl bg-white border-none shadow-sm font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none min-w-0"
            >
              <option value="">כל הייעודים</option>
              <option value="rental">להשכרה</option>
              <option value="sale">למכירה</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setSortOrder(e.target.value === 'name' ? 'asc' : 'desc');
              }}
              className="h-12 px-3 rounded-2xl bg-white border-none shadow-sm font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none col-span-2 sm:col-span-1 min-w-0"
            >
              <option value="name">מיון: שם</option>
              <option value="rental_count">מיון: השכרות</option>
              <option value="total_income">מיון: הכנסה</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dresses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dresses.map((dress) => (
          <Card
            key={dress.id}
            onClick={() => {
              if (sharedMode === "dress_edit" && sharedUploadPayload) {
                setEditingDress(dress);
                setFormData({
                  name: dress.name,
                  base_price: dress.base_price?.toString() || "",
                  status: dress.status,
                  intended_use: dress.intended_use || "rental",
                  photo_url: dress.photo_url || "",
                  thumbnail_url: dress.thumbnail_url || "",
                  notes: dress.notes || "",
                });
                setShowForm(true);
                applySharedImageToForm(sharedUploadPayload);
                return;
              }
              viewDress(dress.id);
            }}
            className="group overflow-hidden rounded-[2rem] border-none shadow-xl shadow-gray-200/50 bg-white transition-all active:scale-[0.98] cursor-pointer"
          >
            {/* Image Placeholder or Actual Image */}
            <div className="relative h-64 bg-muted overflow-hidden">
              {(dress.thumbnail_url || dress.photo_url) ? (
                <img
                  src={dress.thumbnail_url || dress.photo_url || ""}
                  alt={dress.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-primary/20 gap-2 bg-gradient-to-br from-primary/5 to-primary/10">
                  <ShoppingBag className="h-16 w-16" />
                  <span className="text-xs font-bold uppercase tracking-widest">ללא תמונה</span>
                </div>
              )}
              <div className="absolute top-4 right-4">
                <span className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md",
                  dress.status === "sold" || dress.status === "retired"
                    ? "bg-gray-500/90 text-white"
                    : "bg-green-500/90 text-white"
                )}>
                  {getStatusLabel(dress.status)}
                </span>
              </div>
            </div>

            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-black text-xl text-gray-900 leading-snug break-words whitespace-normal">{dress.name}</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase mt-1">
                    מק״ט: {dress.id} • {dress.rental_count} השכרות • {getIntendedUseLabel(dress.intended_use)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="icon" onClick={(e) => handleEdit(e, dress)} className="rounded-xl h-10 w-10">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => handleDelete(e, dress)} className="rounded-xl h-10 w-10 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-2xl">
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">מחיר בסיס</span>
                  <span className="font-black text-lg">{formatCurrency(dress.base_price)}</span>
                </div>
                <div className="bg-primary/5 p-3 rounded-2xl">
                  <span className="block text-[10px] font-bold text-primary/60 uppercase mb-1">סה״כ הכנסות</span>
                  <span className="font-black text-lg text-primary">{formatCurrency(dress.total_income)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dresses.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-[3rem] shadow-inner">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold text-gray-900">לא נמצאו שמלות</h3>
          <p className="text-muted-foreground">נסי לשנות את החיפוש או להוסיף שמלה חדשה</p>
        </div>
      )}

      {/* Dress Details Modal */}
      {viewingDress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-white flex flex-col">
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <ShoppingBag className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="font-black text-2xl leading-snug break-words whitespace-normal">{viewingDress.dress.name}</h2>
                  <p className="text-xs font-bold text-muted-foreground uppercase">
                    מק״ט {viewingDress.dress.id} • {getStatusLabel(viewingDress.dress.status)} • {getIntendedUseLabel(viewingDress.dress.intended_use)}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingDress(null)} className="rounded-full h-10 w-10">
                <X className="h-6 w-6" />
              </Button>
            </div>

            <CardContent className="p-0 overflow-y-auto">
              <div className="p-6 space-y-8">
                {/* Visual Header */}
                {viewingDress.dress.photo_url && (
                  <div className="relative h-48 w-full rounded-3xl overflow-hidden mb-6">
                    <img src={viewingDress.dress.photo_url} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                      <span className="text-white font-bold">{viewingDress.dress.notes || "אין הערות מיוחדות"}</span>
                    </div>
                  </div>
                )}

                {/* Financial Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/30 rounded-2xl text-center">
                    <TrendingUp className="h-5 w-5 mx-auto mb-2 text-green-600" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase">הכנסה כוללת</p>
                    <p className="text-lg font-black text-green-600">{formatCurrency(viewingDress.stats.totalIncome)}</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-2xl text-center">
                    <History className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase">השכרות</p>
                    <p className="text-lg font-black text-primary">{viewingDress.stats.rentalCount}</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-2xl text-center">
                    <Sparkles className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase">מחיר ממוצע</p>
                    <p className="text-lg font-black text-amber-600">{formatCurrency(viewingDress.stats.averagePrice)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-black text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    הזמנות עתידיות לשמלה
                  </h4>
                  {viewingDress.upcoming_bookings.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground bg-muted/10 rounded-2xl italic">
                      אין כרגע הזמנות עתידיות רשומות לשמלה זו
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {viewingDress.upcoming_bookings.map((booking) => (
                        <button
                          key={`${booking.order_id}-${booking.event_date}-${booking.wearer_name || ""}`}
                          type="button"
                          onClick={() => router.push(`/dashboard/orders?id=${booking.order_id}`)}
                          className="w-full text-right p-4 border-2 rounded-2xl bg-amber-50/70 border-amber-200 hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.98]"
                        >
                          <p className="font-black text-gray-900">
                            {formatDateShort(booking.event_date)} • הזמנה #{booking.order_id}
                          </p>
                          <p className="text-xs font-bold text-muted-foreground uppercase">
                            {booking.wearer_name ? `לובשת: ${booking.wearer_name}` : booking.customer_name || "לקוחה לא ידועה"}
                            {booking.customer_name && booking.wearer_name && booking.customer_name !== booking.wearer_name ? ` • לקוחה: ${booking.customer_name}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rental History */}
                <div className="space-y-4">
                  <h4 className="font-black text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    היסטוריית אירועים
                  </h4>
                  <div className="space-y-3">
                    {viewingDress.rentals.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground bg-muted/10 rounded-2xl italic">טרם בוצעו השכרות לשמלה זו</p>
                    ) : (
                      viewingDress.rentals.map((rental, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (rental.order_id) {
                              router.push(`/dashboard/orders?id=${rental.order_id}`);
                            } else {
                              toast({ title: "מידע חסר", description: "לא נמצא מזהה הזמנה עבור רשומה ישנה זו" });
                            }
                          }}
                          className={cn(
                            "flex justify-between items-center p-4 bg-white border-2 rounded-2xl transition-all",
                            rental.order_id ? "cursor-pointer hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]" : "opacity-80"
                          )}
                        >
                          <div>
                            <p className="font-black text-gray-900">
                              {rental.wearer_name || rental.customer_name || rental.customer_full_name || "לקוחה לא ידועה"} (לובשת)
                            </p>
                            <p className="text-xs font-bold text-muted-foreground uppercase">
                              {formatDateShort(rental.event_date)} • {
                                !rental.order_id ? "סוג פעולה לא ידוע" :
                                  (rental.rental_type === 'sale' ? 'מכירה' :
                                    rental.rental_type === 'sewing_for_rental' ? 'תפירה שנשארת בהשכרה' : 'השכרה')
                              }
                              {rental.customer_full_name && rental.customer_full_name !== rental.wearer_name && ` • לקוחה: ${rental.customer_full_name}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-primary text-lg">{formatCurrency(rental.amount)}</p>
                            {rental.order_id && <p className="text-[10px] font-bold text-muted-foreground uppercase">צפי בהזמנה #{rental.order_id}</p>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>

            <div className="p-6 border-t bg-muted/10">
              <Button onClick={(e) => { setViewingDress(null); handleEdit(e, viewingDress.dress); }} className="w-full h-14 rounded-2xl font-black text-lg shadow-lg">
                <Edit className="h-5 w-5 ml-2" /> עריכת פרטי שמלה
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-background z-[120] overflow-y-auto lg:bg-black/50 lg:flex lg:items-center lg:justify-center p-0 lg:p-4">
          <Card className="w-full h-full lg:h-auto lg:max-w-lg rounded-none lg:rounded-[2rem] border-none shadow-2xl">
            <div className="sticky top-0 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b z-10 lg:rounded-t-[2rem]">
              <h2 className="font-black text-xl">{editingDress ? "עריכת שמלה" : "שמלה חדשה"}</h2>
              <Button variant="ghost" size="icon" onClick={resetForm} className="rounded-full">
                <X className="h-6 w-6" />
              </Button>
            </div>

            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">שם השמלה *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-14 rounded-2xl bg-muted/30 border-transparent focus:bg-white transition-all text-lg"
                    placeholder="לדוגמה: שמלת זהב נוצצת"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">מחיר בסיס</label>
                    <Input
                      type="number"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      className="h-14 rounded-2xl bg-muted/30 border-transparent"
                      placeholder="₪"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">סטטוס</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full h-14 px-4 rounded-2xl bg-muted/30 border-none outline-none text-sm font-bold"
                    >
                      <option value="available">פנויה</option>
                      <option value="sold">נמכרה</option>
                      <option value="retired">הוצאה מהמלאי</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">ייעוד שמלה</label>
                  <select
                    value={formData.intended_use}
                    onChange={(e) => setFormData({ ...formData, intended_use: e.target.value as "rental" | "sale" })}
                    className="w-full h-14 px-4 rounded-2xl bg-muted/30 border-none outline-none text-sm font-bold"
                  >
                    <option value="rental">מיועדת להשכרה</option>
                    <option value="sale">מיועדת למכירה</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">תמונת השמלה</label>
                  <div className="flex flex-col gap-4">
                    {formData.photo_url ? (
                      <div className="relative h-40 w-full rounded-2xl overflow-hidden border-2 border-primary/20 bg-muted/30 group">
                        <img
                          src={formData.photo_url}
                          alt="תצוגה מקדימה"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, photo_url: "", thumbnail_url: "" }))}
                          className="absolute top-2 left-2 h-8 w-8 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="h-40 w-full rounded-2xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/30 transition-all">
                        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                          <Plus className="h-6 w-6" />
                        </div>
                        <span className="text-sm font-bold text-muted-foreground">לחצי להעלאת תמונה</span>
                        <span className="text-[10px] text-muted-foreground/60 uppercase font-black">JPG, PNG, WEBP (מקס' 10MB)</span>
                        <input
                          type="file"
                          className="hidden"
                          // Keep chooser behavior consistent on Android (camera/gallery/files),
                          // while actual validation still enforces image-only uploads.
                          accept="image/*,application/pdf"
                          capture="environment"
                          onChange={handleFileUpload}
                          disabled={saving}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">הערות</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full h-32 p-4 rounded-2xl bg-muted/30 border-none focus:ring-2 focus:ring-primary/20 outline-none resize-none shadow-inner"
                    placeholder="מידות, סוג בד, דגשים מיוחדים..."
                  />
                </div>

                <div className="flex gap-4 pt-4 lg:pb-0 pb-12">
                  <Button type="button" variant="outline" onClick={resetForm} className="flex-1 h-14 rounded-2xl font-bold">
                    ביטול
                  </Button>
                  <Button type="submit" disabled={saving} className="flex-1 h-14 rounded-2xl font-bold shadow-lg shadow-primary/20">
                    {saving ? "שומר..." : editingDress ? "עדכן שמלה" : "שמור שמלה"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
