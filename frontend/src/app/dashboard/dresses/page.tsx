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
  resolveFileUrl,
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
  customer_full_name: string;
  customer_name: string;
  wearer_name: string;
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

function getIntendedUseLabel(intendedUse: "rental" | "sale" | null | undefined) {
  if (intendedUse === "sale") return "מיועדת למכירה";
  if (intendedUse === "rental") return "מיועדת להשכרה";
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
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<string>("asc");

  const [viewingDress, setViewingDress] = useState<DressDetailData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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
      sort: string = "name",
      order: string = "asc"
    ) => {
      try {
        const response = await dressesApi.list({
          search: searchQuery,
          status: status || undefined,
          intended_use: intendedUse === "__empty__" ? "__empty__" : (intendedUse || undefined),
          sortBy: sort,
          sortOrder: order,
          limit: 1000,
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
          <Button onClick={() => router.push("/dashboard/dresses/new")} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20">
            <Plus className="h-5 w-5 ml-2" />
            שמלה
          </Button>
        </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dresses.map((dress) => {
          const imgUrl = resolveFileUrl(dress.thumbnail_url || dress.photo_url) || dress.thumbnail_url || dress.photo_url;
          return (
            <Card
              key={dress.id}
              onClick={() => {
                if (searchParams.get("share_context") === "dress_edit") {
                  router.push(`/dashboard/dresses/${dress.id}/edit`);
                  return;
                }
                viewDress(dress.id);
              }}
              className="group overflow-hidden rounded-[2rem] border-none shadow-xl shadow-gray-200/50 bg-white transition-all active:scale-[0.98] cursor-pointer"
            >
              <div className="relative aspect-[3/4] bg-muted overflow-hidden">
                {imgUrl ? (
                  <img
                    src={imgUrl}
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
                      מק״ט: {dress.id} • {dress.rental_count} השכרות • {getIntendedUseLabel(dress.intended_use)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="icon" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/dresses/${dress.id}/edit`); }} className="rounded-xl h-10 w-10">
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
          );
        })}
      </div>

      {dresses.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-[3rem] shadow-inner">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold text-gray-900">לא נמצאו שמלות</h3>
          <p className="text-muted-foreground">נסי לשנות את החיפוש או להוסיף שמלה חדשה</p>
        </div>
      )}

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
                {viewingDress.dress.photo_url && (
                  <div className="relative h-48 w-full rounded-3xl overflow-hidden mb-6">
                    <img src={resolveFileUrl(viewingDress.dress.photo_url) || viewingDress.dress.photo_url || ""} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                      <span className="text-white font-bold">{viewingDress.dress.notes || "אין הערות מיוחדות"}</span>
                    </div>
                  </div>
                )}

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
