"use client";

/**
 * Customers Management Page - Enhanced for Mobile
 * 
 * Purpose: Display and manage customers with high clarity and quick contact actions.
 * Features: Mobile-friendly cards, quick call/WhatsApp, and full inventory view.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customersApi } from "@/lib/api";
import { formatPhoneNumber, createWhatsAppLink, formatDateShort, debounce, normalizePhoneInput, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  MessageCircle,
  Edit,
  Trash2,
  X,
  UserPlus,
  Sparkles,
} from "lucide-react";

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  source: string;
  notes: string;
}

export default function CustomersPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>({
    name: "",
    phone: "",
    email: "",
    source: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState("last_active_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);

  const fetchCustomers = useCallback(async (searchQuery: string = "", sortCol: string = "last_active_date", sortDir: string = "desc") => {
    try {
      const response = await customersApi.list({
        search: searchQuery,
        sortBy: sortCol,
        sortOrder: sortDir,
        limit: 1000 // Show everything
      });
      if (response.success && response.data) {
        const data = response.data as { customers: Customer[] };
        setCustomers(data.customers);
      }
    } catch (error) {
      console.error("Failed to load customers:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון את רשימת הלקוחות",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((query: any, sortCol: any, sortDir: any) => {
      fetchCustomers(query as string, sortCol as string, sortDir as string);
    }, 300),
    [fetchCustomers]
  );

  useEffect(() => {
    fetchCustomers(search, sortBy, sortOrder);
  }, [search, sortBy, sortOrder, fetchCustomers]);

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      source: "",
      notes: "",
    });
    setEditingCustomer(null);
    setShowForm(false);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      source: customer.source || "",
      notes: customer.notes || "",
    });
    setShowForm(true);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleMergeClick = () => {
    if (selectedIds.length !== 2) return;
    setMergeTargetId(selectedIds[0]); // Default to first selected
    // Pre-fill form with target data
    const target = customers.find(c => c.id === selectedIds[0]);
    if (target) {
      setFormData({
        name: target.name,
        phone: target.phone || "",
        email: target.email || "",
        source: target.source || "",
        notes: target.notes || "",
      });
    }
    setShowMergeDialog(true);
  };

  const executeMerge = async () => {
    if (!mergeTargetId || selectedIds.length !== 2) return;
    const sourceId = selectedIds.find(id => id !== mergeTargetId);
    if (!sourceId) return;

    setSaving(true);
    try {
      await customersApi.merge(mergeTargetId, sourceId, formData);
      toast({ title: "הצלחה", description: "לקוחות אוחדו בהצלחה" });
      setShowMergeDialog(false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      fetchCustomers(search);
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה במיזוג",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "שגיאה", description: "נא להזין שם לקוח", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingCustomer) {
        await customersApi.update(editingCustomer.id, formData);
        toast({ title: "הצלחה", description: "לקוח עודכן בהצלחה" });
      } else {
        await customersApi.create(formData);
        toast({ title: "הצלחה", description: "לקוח נוסף בהצלחה" });
      }
      resetForm();
      fetchCustomers(search);
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בשמירת לקוח",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`האם למחוק את ${customer.name}?`)) return;
    try {
      await customersApi.delete(customer.id);
      toast({ title: "הצלחה", description: "לקוח נמחק בהצלחה" });
      fetchCustomers(search);
    } catch (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">הלקוחות שלי</span>
            </div>
            <h1 className="text-3xl font-black">קהל <span className="text-primary">היעד</span></h1>
            <p className="text-muted-foreground text-sm font-medium">
              {customers.length} לקוחות רשומות במערכת
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isSelectionMode ? "secondary" : "outline"}
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                setSelectedIds([]);
              }}
              className="rounded-2xl h-12 px-4 border-2"
            >
              {isSelectionMode ? "ביטול בחירה" : "בחירה מרובה"}
            </Button>
            <Button onClick={() => setShowForm(true)} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20">
              <Plus className="h-5 w-5 ml-2" />
              לקוחה
            </Button>
          </div>
        </div>

        {/* Search & Source Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="חפשי לפי שם או טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-14 pr-12 rounded-2xl bg-white border-none shadow-sm text-lg"
            />
          </div>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [col, dir] = e.target.value.split('-');
              setSortBy(col);
              setSortOrder(dir);
            }}
            className="h-14 px-4 rounded-2xl bg-white border-none shadow-sm font-bold text-sm"
          >
            <option value="last_active_date-desc">פעילות אחרונה</option>
            <option value="name-asc">שם (א' - ת')</option>
            <option value="created_at-desc">נוספו לאחרונה</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-14 px-4 rounded-2xl bg-white border-none shadow-sm font-bold text-sm"
          >
            <option value="">כל המקורות</option>
            {Array.from(new Set(customers.map(c => c.source).filter(Boolean))).sort().map(src => (
              <option key={src} value={src!}>{src}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Customers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.filter(c => !sourceFilter || c.source === sourceFilter).map((customer) => (
          <div key={customer.id} className="relative group">
            {isSelectionMode && (
              <div
                className={cn(
                  "absolute top-4 right-4 z-10 h-6 w-6 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-white",
                  selectedIds.includes(customer.id) ? "border-primary bg-primary text-white" : "border-muted-foreground/30"
                )}
                onClick={() => toggleSelection(customer.id)}
              >
                {selectedIds.includes(customer.id) && <CheckIcon className="h-4 w-4" />}
              </div>
            )}
            <Card
              onClick={() => isSelectionMode && toggleSelection(customer.id)}
              className={cn(
                "rounded-[1.5rem] border-none shadow-xl shadow-gray-200/40 bg-white transition-all active:scale-[0.98]",
                isSelectionMode && "cursor-pointer hover:ring-2 hover:ring-primary/50",
                selectedIds.includes(customer.id) && "ring-2 ring-primary bg-primary/5"
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary font-black text-xl">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900 leading-none">{customer.name}</h3>
                      <p className="text-xs font-medium text-muted-foreground mt-1">
                        {customer.phone ? formatPhoneNumber(customer.phone) : "ללא טלפון"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {customer.phone && !isSelectionMode && (
                      <a
                        href={createWhatsAppLink(customer.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 transition-colors active:bg-green-100"
                      >
                        <MessageCircle className="h-5 w-5" />
                      </a>
                    )}
                    {customer.phone && !isSelectionMode && (
                      <a
                        href={`tel:${customer.phone}`}
                        className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 transition-colors active:bg-blue-100"
                      >
                        <Phone className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-4">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-2 py-1 rounded-lg uppercase">
                      נוספה: {formatDateShort(customer.created_at)}
                    </span>
                    {customer.source && (
                      <span className="text-[10px] font-bold text-primary/60 bg-primary/5 px-2 py-1 rounded-lg uppercase">
                        {customer.source}
                      </span>
                    )}
                  </div>
                  {!isSelectionMode && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)} className="h-8 w-8 text-gray-400">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(customer)} className="h-8 w-8 text-red-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Floating Merge Button */}
      {isSelectionMode && selectedIds.length === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <Button
            onClick={handleMergeClick}
            className="h-14 px-8 rounded-full shadow-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg gap-2"
          >
            <Users className="h-5 w-5" />
            מיזוג 2 לקוחות שנבחרו
          </Button>
        </div>
      )}

      {customers.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-[3rem] shadow-inner">
          <UserPlus className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold text-gray-900">לא נמצאו לקוחות</h3>
          <p className="text-muted-foreground">נסי לשנות את החיפוש או להוסיף לקוחה חדשה</p>
        </div>
      )}

      {/* Merge Dialog */}
      {showMergeDialog && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem]">
            <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-2xl font-black text-purple-700">איחוד כרטיסי לקוחה</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMergeDialog(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="bg-purple-50 p-4 rounded-xl text-purple-800 text-sm font-medium">
                שימי לב: פעולה זו תאחד את כל ההזמנות, התשלומים וההיסטוריה של שתי הלקוחות ללקוחה אחת. הלקוחה השנייה תימחק.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedIds.map(id => {
                  const c = customers.find(cust => cust.id === id);
                  if (!c) return null;
                  const isTarget = mergeTargetId === id;
                  return (
                    <div
                      key={id}
                      onClick={() => {
                        setMergeTargetId(id);
                        setFormData({
                          name: c.name,
                          phone: c.phone || "",
                          email: c.email || "",
                          source: c.source || "",
                          notes: c.notes || "",
                        });
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
                        isTarget ? "border-purple-600 bg-purple-50" : "border-muted hover:border-purple-300"
                      )}
                    >
                      {isTarget && (
                        <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-xl">
                          הלקוחה הראשית (תישמר)
                        </div>
                      )}
                      <h3 className="font-bold text-lg mb-1">{c.name}</h3>
                      <p className="text-sm text-muted-foreground">{c.phone}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold mb-4">עריכת פרטים סופיים ללקוחה המאוחדת:</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold">שם מלא</label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold">טלפון</label>
                      <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold">אימייל</label>
                      <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} dir="ltr" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">הערות (יחליף את הקיים)</label>
                    <textarea
                      className="w-full h-24 p-3 border rounded-xl"
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setShowMergeDialog(false)}>ביטול</Button>
                <Button
                  className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 font-bold"
                  onClick={executeMerge}
                  disabled={saving}
                >
                  {saving ? "מאחד..." : "אשרי וסיימי איחוד"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Form Modal (Full Screen Mobile) */}
      {showForm && (
        <div className="fixed inset-0 bg-background z-[100] overflow-y-auto lg:bg-black/50 lg:flex lg:items-center lg:justify-center p-0 lg:p-4">
          <Card className="w-full h-full lg:h-auto lg:max-w-lg rounded-none lg:rounded-[2rem] border-none">
            <div className="sticky top-0 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b z-10 lg:rounded-t-[2rem]">
              <h2 className="font-black text-xl">{editingCustomer ? "עריכת לקוחה" : "לקוחה חדשה"}</h2>
              <Button variant="ghost" size="icon" onClick={resetForm} className="rounded-full">
                <X className="h-6 w-6" />
              </Button>
            </div>

            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {!editingCustomer && (
                  <div className="flex justify-end mb-2">
                    <ContactPicker
                      onContactSelect={(contact) => {
                        setFormData({
                          ...formData,
                          name: contact.name,
                          phone: normalizePhoneInput(contact.phone),
                          email: contact.email
                        });
                      }}
                      className="rounded-xl h-10 border-primary text-primary hover:bg-primary/5"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">שם הלקוחה *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="focus:border-primary"
                    placeholder="שם מלא"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">טלפון</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: normalizePhoneInput(e.target.value) })}
                      className="focus:border-primary"
                      placeholder="05X-XXXXXXX"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">אימייל</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="focus:border-primary"
                      placeholder="example@mail.com"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">מקור הגעה</label>
                  <Input
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="focus:border-primary"
                    placeholder="איך היא הגיעה אליך?"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">הערות</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full h-32 p-4 border-b-2 border-input bg-transparent focus:border-primary transition-all outline-none resize-none"
                    placeholder="הערות אישיות, העדפות וכו'..."
                  />
                </div>

                <div className="flex gap-4 pt-4 lg:pb-0 pb-12">
                  <Button type="button" variant="outline" onClick={resetForm} className="flex-1 h-14 rounded-2xl font-bold">
                    ביטול
                  </Button>
                  <Button type="submit" disabled={saving} className="flex-1 h-14 rounded-2xl font-bold shadow-lg shadow-primary/20">
                    {saving ? "שומר..." : editingCustomer ? "עדכן לקוחה" : "שמור לקוחה"}
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

function CheckIcon(props: any) {
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
