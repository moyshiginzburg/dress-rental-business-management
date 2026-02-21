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
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { dressesApi, ordersApi, agreementsApi } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";

const ORDER_TYPES = [
  { value: "rental", label: "השכרה" },
  { value: "sewing_for_rental", label: "תפירה שנשארת בהשכרה" },
  { value: "sewing", label: "תפירה" },
  { value: "sale", label: "מכירה" },
];

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

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingSignLink, setSendingSignLink] = useState(false);

  // Data lists
  const [dresses, setDresses] = useState<{ id: number; name: string; base_price?: number }[]>([]);
  
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dresRes, orderRes] = await Promise.all([
          dressesApi.available(),
          ordersApi.get(parseInt(orderId))
        ]);
        
        if (dresRes.success) {
          const dData = (dresRes.data as any).dresses;
          setDresses(dData || []);
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
          
          if (data.items && Array.isArray(data.items)) {
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
      } catch (e) {
        console.error("Error loading order for edit:", e);
        toast({ title: "שגיאה", description: "לא ניתן לטעון את פרטי ההזמנה. בדקי את החיבור לשרת.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [orderId, toast]);

  const addItem = () => {
    setItems([...items, { dress_id: "", dress_name: "", item_type: "rental", base_price: "", additional_payments: "", wearer_name: "", notes: "" }]);
  };

  const handleSendSignatureLink = async (openWhatsapp: boolean) => {
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

      try {
        await navigator.clipboard.writeText(data.link);
        toast({ title: "קישור חתימה נוצר", description: "הקישור הועתק ללוח." });
      } catch {
        toast({ title: "קישור חתימה נוצר", description: data.link });
      }

      if (openWhatsapp && data.whatsappLink) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "לא ניתן ליצור קישור חתימה",
        variant: "destructive"
      });
    } finally {
      setSendingSignLink(false);
    }
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === "dress_id" && value) {
      const dress = dresses.find(d => d.id.toString() === value);
      if (dress) {
        newItems[index].dress_name = dress.name;
        if (dress.base_price) {
          newItems[index].base_price = dress.base_price.toString();
        }
      }
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
      toast({ title: "שגיאה", description: error instanceof Error ? error.message : "שגיאה בעדכון ההזמנה", variant: "destructive" });
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
                  className="h-12 text-lg rounded-xl"
                  required
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Agreement Link Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <Link2 className="h-5 w-5" />
            <h2 className="font-bold text-lg">חתימה דיגיטלית על הסכם</h2>
          </div>
          <Card className="border-2">
            <CardContent className="p-4 sm:p-6">
              <p className="text-sm text-muted-foreground mb-4">
                יצירת קישור ציבורי מאובטח לחתימה עבור הזמנה זו, עם מילוי אוטומטי של פרטי הלקוחה וההזמנה.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSendSignatureLink(false)}
                  disabled={sendingSignLink}
                  className="border-green-600 text-green-700"
                >
                  <Copy className="h-4 w-4 ml-2" />
                  {sendingSignLink ? "יוצר קישור..." : "יצירה והעתקה של קישור"}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSendSignatureLink(true)}
                  disabled={sendingSignLink || !customerPhone}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4 ml-2" />
                  שליחה לוואטסאפ
                </Button>
              </div>
              {!customerPhone && (
                <p className="text-xs text-muted-foreground mt-3">
                  חסר טלפון לקוחה בהזמנה, לכן כפתור WhatsApp מושבת. עדיין אפשר ליצור ולהעתיק קישור.
                </p>
              )}
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
            {items.map((item, index) => (
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
                        {ORDER_TYPES.map(t => (
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
                        <select
                          value={item.dress_id}
                          onChange={(e) => updateItem(index, "dress_id", e.target.value)}
                          className="w-full h-12 px-3 rounded-xl border-2 bg-background font-bold text-green-600 focus:border-green-600 outline-none"
                        >
                          <option value="">בחרי מהמלאי...</option>
                          {dresses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (
                        <Input
                          value={item.dress_name}
                          onChange={(e) => updateItem(index, "dress_name", e.target.value)}
                          placeholder="שם השמלה החדשה"
                          className="h-12 rounded-xl border-2"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-[10px]">שם הלובשת (אופציונלי)</label>
                      <Input
                        value={item.wearer_name}
                        onChange={(e) => updateItem(index, "wearer_name", e.target.value)}
                        placeholder="מי תלבש את השמלה?"
                        className="h-12 rounded-xl border-2"
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
                          className="h-12 rounded-xl border-2 text-center text-lg font-bold"
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
                          className="h-12 rounded-xl border-2 text-center text-lg font-bold"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {/* Item Notes - collapsible for minimal UI clutter */}
                    <div className="sm:col-span-2 mt-2">
                      <details className="group">
                        <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer select-none hover:text-green-600 transition-colors">
                          הערות לפריט {item.notes ? "📝" : "(לחצי להוספה)"}
                        </summary>
                        <div className="mt-2">
                          <Input
                            value={item.notes}
                            onChange={(e) => updateItem(index, "notes", e.target.value)}
                            placeholder="הערה ספציפית לפריט זה..."
                            className="h-12 rounded-xl border-2"
                          />
                        </div>
                      </details>
                    </div>
                  </div>
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
            className="w-full h-32 p-4 rounded-2xl border-2 bg-background focus:border-green-600 outline-none resize-none shadow-inner"
          />
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
