"use client";

/**
 * Dresses Management Page - Enhanced for Mobile
 *
 * Purpose: Display dress inventory as a beautiful, high-end catalog.
 * Features: Visual grid, quick actions, status badges, merge functionality.
 *
 * Note: Dresses can never be deleted individually. Instead, two dresses can
 * be merged into one, combining their full history in chronological order.
 * The delete button has been removed entirely in favour of the merge flow.
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
  X,
  Calendar,
  TrendingUp,
  History,
  Sparkles,
  LayoutGrid,
  List,
  Tag,
  Users,
} from "lucide-react";
import { base64ToFile, clearSharedUploadPayload, getSharedUploadPayload, type SharedUploadPayload } from "@/lib/shared-upload";

interface Dress {
  id: number;
  name: string;
  base_price: number;
  total_income: number;
  rental_count: number;
  status: string;
  intended_use: "rental" | "sale" | null;
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

/* interface DressFormData {
  name: string;
  base_price: string;
  status: string;
  intended_use: "" | "rental" | "sale";
  photo_url: string;
  thumbnail_url: string;
  notes: string;
} */

function getIntendedUseLabel(intendedUse: "rental" | "sale" | null | undefined) {
  if (intendedUse === "sale") return "מיועדת למכירה";
  if (intendedUse === "rental") return "מיועדת להשכרה";
  return "ללא ייעוד";
}

/** Short label used in list-view rows — no "מיועדת" prefix. */
function getIntendedUseShortLabel(intendedUse: "rental" | "sale" | null | undefined) {
  if (intendedUse === "sale") return "למכירה";
  if (intendedUse === "rental") return "להשכרה";
  return "ללא ייעוד";
}

function isDressBookable(status: string) {
  return status === "available";
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
  const [sortBy, setSortBy] = useState<string>("last_active_date");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  // View mode: "list" (default, compact rows) or "grid" (original card tiles)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [viewingDress, setViewingDress] = useState<DressDetailData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Merge & Selection state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [mergePhotoUrl, setMergePhotoUrl] = useState<string | null>(null);
  const [mergeThumbnailUrl, setMergeThumbnailUrl] = useState<string | null>(null);
  const [mergeNotes, setMergeNotes] = useState("");
  const [savingMerge, setSavingMerge] = useState(false);

  useEffect(() => {
    if (searchParams.get("shared_upload") !== "1") return;
    const mode = searchParams.get("share_context");

    if (mode === "dress_add") {
      router.push("/dashboard/dresses/new");
    } else if (mode === "dress_edit") {
      toast({
        title: "בחרי שמלה לעדכון",
        description: "לחצי על שמלה כדי לפתוח מסך עריכה ולעדכן לה תמונה.",
      });
    }
  }, [searchParams, router, toast]);

  const fetchDresses = useCallback(
    async (
      searchQuery: string = "",
      status: string = "",
      intendedUse: string = "",
      sort: string = "last_active_date",
      order: string = "desc"
    ) => {
      try {
        const response = await dressesApi.list({
          search: searchQuery,
          status: status || undefined,
          intended_use: intendedUse === "__empty__" ? "__empty__" : (intendedUse || undefined),
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

  useEffect(() => {
    const dressId = searchParams.get("id");
    if (dressId && !viewingDress) {
      viewDress(parseInt(dressId));
    }
  }, [searchParams]);

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleMergeClick = () => {
    if (selectedIds.length !== 2) return;
    const defaultTargetId = selectedIds[0];
    const target = dresses.find(d => d.id === defaultTargetId);
    setMergeTargetId(defaultTargetId);
    setMergeName(target?.name ?? "");
    setMergePhotoUrl(target?.photo_url ?? null);
    setMergeThumbnailUrl(target?.thumbnail_url ?? null);
    setMergeNotes(target?.notes ?? "");
    setShowMergeDialog(true);
  };

  const executeMerge = async () => {
    if (!mergeTargetId || selectedIds.length !== 2) return;
    const sourceId = selectedIds.find(id => id !== mergeTargetId);
    if (!sourceId) return;

    setSavingMerge(true);
    try {
      await dressesApi.merge(mergeTargetId, sourceId, {
        name: mergeName,
        photo_url: mergePhotoUrl,
        thumbnail_url: mergeThumbnailUrl,
        notes: mergeNotes,
      });
      toast({ title: "הצלחה", description: "שמלות אוחדו בהצלחה" });
      setShowMergeDialog(false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      fetchDresses(search, statusFilter, intendedUseFilter, sortBy, sortOrder);
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
          <div className="flex gap-2">
            <Button
              variant={isSelectionMode ? "secondary" : "outline"}
              onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}
              className="rounded-2xl h-12 px-4 border-2"
            >
              {isSelectionMode ? "ביטול" : "מיזוג"}
            </Button>
            <Button onClick={() => router.push("/dashboard/dresses/new")} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20">
              <Plus className="h-5 w-5 ml-2" />
              שמלה
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם שמלה או לובשת..."
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
              <option value="custom_sewing">תפירה אישית</option>
            </select>
            <select
              value={intendedUseFilter}
              onChange={(e) => setIntendedUseFilter(e.target.value)}
              className="h-12 px-3 rounded-2xl bg-white border-none shadow-sm font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none min-w-0"
            >
              <option value="">כל הייעודים</option>
              <option value="rental">להשכרה</option>
              <option value="sale">למכירה</option>
              <option value="__empty__">ללא ייעוד</option>
            </select>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                // Split on the last dash so we correctly handle column names
                // like "last_active_date" that contain no dashes themselves,
                // while still separating "rental_count-desc" into col + dir.
                const lastDash = e.target.value.lastIndexOf('-');
                const col = e.target.value.slice(0, lastDash);
                const dir = e.target.value.slice(lastDash + 1);
                setSortBy(col);
                setSortOrder(dir);
              }}
              className="h-12 px-3 rounded-2xl bg-white border-none shadow-sm font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none col-span-2 sm:col-span-1 min-w-0"
            >
              <option value="last_active_date-desc">פעילות אחרונה</option>
              <option value="name-asc">שם (א' - ת')</option>
              <option value="rental_count-desc">מיון: השכרות</option>
              <option value="total_income-desc">מיון: הכנסה</option>
            </select>
          </div>

          {/* View mode toggle — same visual pattern as DressSelector */}
          <div className="inline-flex rounded-xl border bg-white p-1 self-start">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-9 px-3 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5",
                viewMode === "list" ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              <List className="h-3.5 w-3.5" />
              רשימה
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "h-9 px-3 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5",
                viewMode === "grid" ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              תמונות
            </button>
          </div>
        </div>
      </div>

      {/* ── LIST VIEW ── compact rows, click opens modal or selects for merge */}
      {viewMode === "list" && (
        <div className="space-y-2">
          {dresses.map((dress) => (
            <div
              key={dress.id}
              onClick={() => {
                if (isSelectionMode) { toggleSelection(dress.id); return; }
                if (searchParams.get("share_context") === "dress_edit") {
                  router.push(`/dashboard/dresses/${dress.id}/edit`);
                  return;
                }
                viewDress(dress.id);
              }}
              className={cn(
                "flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-all active:scale-[0.99]",
                isSelectionMode && "hover:ring-2 hover:ring-purple-400/50",
                selectedIds.includes(dress.id) && "ring-2 ring-purple-600 bg-purple-50"
              )}
            >
              {isSelectionMode && (
                <div className={cn(
                  "h-6 w-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                  selectedIds.includes(dress.id) ? "border-purple-600 bg-purple-600" : "border-muted-foreground/30 bg-white"
                )}>
                  {selectedIds.includes(dress.id) && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                </div>
              )}
              {/* Thumbnail — right side in RTL (order-1 = flex start) */}
              <div className="order-1 h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 bg-muted border border-border/60">
                {(dress.thumbnail_url || dress.photo_url) ? (
                  <img
                    src={dress.thumbnail_url || dress.photo_url || ""}
                    alt={dress.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
              </div>

              {/* Name + 2 detail rows */}
              <div className="order-2 flex-1 min-w-0 text-right">
                <div className="font-bold text-base leading-snug break-words">{dress.name}</div>
                <div className="text-[11px] font-bold text-muted-foreground mt-0.5">
                  מק&quot;ט: {dress.id} • {dress.rental_count} השכרות • {getIntendedUseShortLabel(dress.intended_use)}
                </div>
                <div className="text-[11px] font-bold text-muted-foreground mt-0.5">
                  מחיר: {formatCurrency(dress.base_price)} • הכנסות: {formatCurrency(dress.total_income)}
                </div>
              </div>

              {/* Status badge — left side in RTL (order-3 = flex end) */}
              <span className={cn(
                "order-3 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                dress.status === "available" ? "bg-green-500 text-white" : "bg-gray-500 text-white"
              )}>
                {getStatusLabel(dress.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── GRID / IMAGE VIEW ── tile cards with edit button (no delete) */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dresses.map((dress) => (
            <Card
              key={dress.id}
              onClick={() => {
                if (isSelectionMode) { toggleSelection(dress.id); return; }
                if (searchParams.get("share_context") === "dress_edit") {
                  router.push(`/dashboard/dresses/${dress.id}/edit`);
                  return;
                }
                viewDress(dress.id);
              }}
              className={cn(
                "group overflow-hidden rounded-[2rem] border-none shadow-xl shadow-gray-200/50 bg-white transition-all active:scale-[0.98] cursor-pointer",
                selectedIds.includes(dress.id) && "ring-2 ring-purple-600"
              )}
            >
              {/* Image Placeholder or Actual Image */}
              <div className="relative aspect-[3/4] bg-muted overflow-hidden">
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
                    dress.status === "available"
                      ? "bg-green-500/90 text-white"
                      : "bg-gray-500/90 text-white"
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
                      מק&quot;ט: {dress.id} • {dress.rental_count} השכרות • {getIntendedUseLabel(dress.intended_use)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!isSelectionMode && (
                      <Button variant="secondary" size="icon" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/dresses/${dress.id}/edit`); }} className="rounded-xl h-10 w-10">
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {isSelectionMode && (
                      <div className={cn(
                        "h-10 w-10 rounded-xl border-2 flex items-center justify-center",
                        selectedIds.includes(dress.id) ? "border-purple-600 bg-purple-600" : "border-muted-foreground/30"
                      )}>
                        {selectedIds.includes(dress.id) && <CheckIcon className="h-4 w-4 text-white" />}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <span className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">מחיר בסיס</span>
                    <span className="font-black text-lg">{formatCurrency(dress.base_price)}</span>
                  </div>
                  <div className="bg-primary/5 p-3 rounded-2xl">
                    <span className="block text-[10px] font-bold text-primary/60 uppercase mb-1">סה&quot;כ הכנסות</span>
                    <span className="font-black text-lg text-primary">{formatCurrency(dress.total_income)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dresses.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-[3rem] shadow-inner">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold text-gray-900">לא נמצאו שמלות</h3>
          <p className="text-muted-foreground">נסי לשנות את החיפוש או להוסיף שמלה חדשה</p>
        </div>
      )}

      {/* Floating Merge Button */}
      {isSelectionMode && selectedIds.length === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <Button
            onClick={handleMergeClick}
            className="h-14 px-8 rounded-full shadow-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg gap-2"
          >
            <Users className="h-5 w-5" />
            מיזוג 2 שמלות שנבחרו
          </Button>
        </div>
      )}

      {/* Merge Dialog */}
      {showMergeDialog && (() => {
        const d0 = dresses.find(d => d.id === selectedIds[0]);
        const d1 = dresses.find(d => d.id === selectedIds[1]);
        return (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem]">
              <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                <h2 className="text-2xl font-black text-purple-700">איחוד שמלות</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowMergeDialog(false)}>
                  <X className="h-6 w-6" />
                </Button>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="bg-purple-50 p-4 rounded-xl text-purple-800 text-sm font-medium">
                  שימי לב: פעולה זו תאחד את כל ההיסטוריה של שתי השמלות לשמלה אחת. השמלה השנייה תימחק לצמיתות.
                </div>

                {/* Pick primary dress */}
                <div className="grid grid-cols-2 gap-4">
                  {[d0, d1].map((d) => {
                    if (!d) return null;
                    const isTarget = mergeTargetId === d.id;
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          setMergeTargetId(d.id);
                          setMergeName(d.name);
                          setMergePhotoUrl(d.photo_url ?? null);
                          setMergeThumbnailUrl(d.thumbnail_url ?? null);
                          setMergeNotes(d.notes ?? "");
                        }}
                        className={cn(
                          "p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
                          isTarget ? "border-purple-600 bg-purple-50" : "border-muted hover:border-purple-300"
                        )}
                      >
                        {isTarget && (
                          <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-xl">
                            שמלה ראשית (תישמר)
                          </div>
                        )}
                        {(d.thumbnail_url || d.photo_url) && (
                          <img src={d.thumbnail_url || d.photo_url || ""} alt={d.name} className="w-full h-28 object-cover rounded-lg mb-2" />
                        )}
                        <h3 className="font-bold text-base leading-snug">{d.name}</h3>
                        <p className="text-xs text-muted-foreground">מק&quot;ט {d.id} • {d.rental_count} השכרות</p>
                      </div>
                    );
                  })}
                </div>

                {/* Edit merged dress details */}
                <div className="border-t pt-4 space-y-4">
                  <h3 className="font-bold">פרטי השמלה המאוחדת:</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">שם השמלה</label>
                    <Input value={mergeName} onChange={e => setMergeName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">תמונה (URL)</label>
                    <Input
                      value={mergePhotoUrl ?? ""}
                      onChange={e => setMergePhotoUrl(e.target.value || null)}
                      dir="ltr"
                      placeholder="/uploads/dresses/..."
                    />
                    {(mergePhotoUrl || mergeThumbnailUrl) && (
                      <img src={mergeThumbnailUrl || mergePhotoUrl || ""} alt="תצוגה מקדימה" className="h-28 w-auto rounded-lg object-cover" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">הערות</label>
                    <textarea
                      className="w-full h-20 p-3 border rounded-xl"
                      value={mergeNotes}
                      onChange={e => setMergeNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <Button variant="outline" className="flex-1 h-12" onClick={() => setShowMergeDialog(false)}>ביטול</Button>
                  <Button
                    className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 font-bold"
                    onClick={executeMerge}
                    disabled={savingMerge || !mergeName.trim()}
                  >
                    {savingMerge ? "מאחד..." : "אשרי וסיימי איחוד"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

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
                    <img src={viewingDress.dress.photo_url || ""} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                      <span className="text-white font-bold">{viewingDress.dress.notes || "אין הערות מיוחדות"}</span>
                    </div>
                  </div>
                )}

                {/* Financial Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                    <p className="text-[10px] font-black text-muted-foreground uppercase">הכנסה ממוצעת</p>
                    <p className="text-lg font-black text-amber-600">{formatCurrency(viewingDress.stats.averagePrice)}</p>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-2xl text-center">
                    <Tag className="h-5 w-5 mx-auto mb-2 text-gray-500" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase">מחיר בסיס</p>
                    <p className="text-lg font-black text-gray-700">{formatCurrency(viewingDress.dress.base_price)}</p>
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
              <Button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/dresses/${viewingDress.dress.id}/edit`); }} className="w-full h-14 rounded-2xl font-black text-lg shadow-lg">
                <Edit className="h-5 w-5 ml-2" /> עריכת פרטי שמלה
              </Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}