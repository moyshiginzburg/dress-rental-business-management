"use client";

/**
 * Dress Selector Component
 * 
 * Purpose: A visual selector for dresses with images and search.
 * Operation: Displays a trigger button showing the selected dress, 
 * and opens a modal with a searchable grid of dresses.
 */

import { useEffect, useMemo, useState } from "react";
import { Search, X, ShoppingBag, Check, Sparkles, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, getStatusLabel } from "@/lib/utils";

interface Dress {
  id: number;
  name: string;
  base_price?: number;
  status: string;
  intended_use?: "rental" | "sale" | null;
  photo_url?: string | null;
  thumbnail_url?: string | null;
  booked_dates?: string[];
}

interface DressSelectorProps {
  dresses: Dress[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  itemType?: string;
}

function getIntendedUseLabel(value: string | null | undefined) {
  if (value === "sale") return "למכירה";
  return "להשכרה";
}

type IntendedUseFilter = "all" | "rental" | "sale";

function getDefaultIntendedUseFilter(itemType: string | undefined): IntendedUseFilter {
  if (itemType === "sale") return "sale";
  if (itemType === "rental" || itemType === "sewing_for_rental") return "rental";
  return "all";
}

function matchesIntendedUseFilter(dress: Dress, filter: IntendedUseFilter) {
  if (filter === "all") return true;
  const intendedUse = dress.intended_use || "rental";
  return intendedUse === filter;
}

export function DressSelector({
  dresses,
  selectedId,
  onSelect,
  placeholder = "בחרי שמלה מהמלאי...",
  itemType,
}: DressSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [intendedUseFilter, setIntendedUseFilter] = useState<IntendedUseFilter>(() =>
    getDefaultIntendedUseFilter(itemType)
  );

  const selectedDress = dresses.find(d => d.id.toString() === selectedId);

  useEffect(() => {
    if (isOpen) {
      setIntendedUseFilter(getDefaultIntendedUseFilter(itemType));
    }
  }, [itemType, isOpen]);

  const dressesByIntendedUse = useMemo(
    () => dresses.filter((dress) => matchesIntendedUseFilter(dress, intendedUseFilter)),
    [dresses, intendedUseFilter]
  );

  const filteredDresses = dressesByIntendedUse.filter((dress) =>
    dress.name.toLowerCase().includes(search.toLowerCase()) || dress.id.toString().includes(search)
  );

  const intendedUseFilterLabel =
    intendedUseFilter === "sale"
      ? "מכירה"
      : intendedUseFilter === "rental"
        ? "השכרה"
        : "הכל";

  return (
    <div className="w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIntendedUseFilter(getDefaultIntendedUseFilter(itemType));
          setIsOpen(true);
        }}
        className={cn(
          "w-full min-h-14 px-4 py-2 rounded-2xl border-2 text-right transition-all flex items-center justify-between group",
          selectedDress 
            ? "border-primary bg-primary/5 shadow-sm" 
            : "border-input bg-background hover:border-primary/50"
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {(selectedDress?.thumbnail_url || selectedDress?.photo_url) ? (
            <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 border border-primary/20">
              <img src={selectedDress.thumbnail_url || selectedDress.photo_url || ""} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 text-right">
            <div className={cn("font-bold leading-tight break-words whitespace-normal", selectedDress ? "text-primary" : "text-muted-foreground")}>
              {selectedDress ? selectedDress.name : placeholder}
            </div>
            {selectedDress && (
              <div className="text-[10px] font-bold text-primary/60 uppercase mt-1">
                מק״ט: {selectedDress.id} • {getIntendedUseLabel(selectedDress.intended_use)} • {formatCurrency(selectedDress.base_price || 0)}
              </div>
            )}
          </div>
        </div>
        <div className="h-8 w-8 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
          <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </div>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setIsOpen(false)}
          />
          
          <Card className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-background flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-black text-xl">בחירת שמלה מהמלאי</h2>
                  <p className="text-xs font-bold text-muted-foreground uppercase">
                    {dressesByIntendedUse.length} שמלות לבחירה • סינון: {intendedUseFilterLabel}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-full">
                <X className="h-6 w-6" />
              </Button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 bg-muted/30">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="חפשי לפי שם או מק״ט..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-12 pr-12 rounded-2xl border-none shadow-sm text-lg bg-white"
                  />
                </div>
                <div className="inline-flex rounded-xl border bg-white p-1">
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
                <div className="inline-flex rounded-xl border bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setIntendedUseFilter("rental")}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-bold transition-all",
                      intendedUseFilter === "rental" ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    להשכרה
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntendedUseFilter("sale")}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-bold transition-all",
                      intendedUseFilter === "sale" ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    למכירה
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntendedUseFilter("all")}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-bold transition-all",
                      intendedUseFilter === "all" ? "bg-primary text-white shadow" : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    הכל
                  </button>
                </div>
              </div>
            </div>

            <CardContent className="p-6 overflow-y-auto flex-1">
              {viewMode === "list" ? (
                <div className="space-y-2">
                  {filteredDresses.map((dress) => (
                    <button
                      key={dress.id}
                      type="button"
                      onClick={() => {
                        onSelect(dress.id.toString());
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-2xl border-2 p-3 transition-all text-right",
                        selectedId === dress.id.toString()
                          ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                          : "border-transparent bg-muted/30 hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="order-1 h-9 w-9 rounded-lg overflow-hidden border border-border/60 bg-muted flex items-center justify-center shrink-0">
                          {(dress.thumbnail_url || dress.photo_url) ? (
                            <img
                              src={dress.thumbnail_url || dress.photo_url || ""}
                              alt={dress.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="order-2 min-w-0 flex-1 text-right">
                          <div className="font-bold text-sm leading-snug truncate">{dress.name}</div>
                          <div className="text-[10px] font-bold text-muted-foreground mt-1">
                            מק״ט {dress.id} • {getIntendedUseLabel(dress.intended_use)} • {formatCurrency(dress.base_price || 0)}
                          </div>
                        </div>
                        <span className={cn(
                          "order-3 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                          dress.status === "available" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                        )}>
                          {getStatusLabel(dress.status)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {filteredDresses.map((dress) => (
                    <button
                      key={dress.id}
                      type="button"
                      onClick={() => {
                        onSelect(dress.id.toString());
                        setIsOpen(false);
                      }}
                      className={cn(
                        "group relative flex flex-col rounded-3xl overflow-hidden border-2 transition-all active:scale-95",
                        selectedId === dress.id.toString()
                          ? "border-primary ring-4 ring-primary/10"
                          : "border-transparent bg-muted/30 hover:bg-muted"
                      )}
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                        {(dress.thumbnail_url || dress.photo_url) ? (
                          <img
                            src={dress.thumbnail_url || dress.photo_url || ""}
                            alt={dress.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-primary/20 gap-2">
                            <ShoppingBag className="h-10 w-10" />
                            <span className="text-[10px] font-black uppercase tracking-widest">ללא תמונה</span>
                          </div>
                        )}

                        {selectedId === dress.id.toString() && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="h-10 w-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg">
                              <Check className="h-6 w-6" />
                            </div>
                          </div>
                        )}

                        <div className="absolute top-2 right-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                              dress.status === "available" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                            )}
                          >
                            {getStatusLabel(dress.status)}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 text-right">
                        <div className="font-bold text-sm leading-snug break-words whitespace-normal group-hover:text-primary transition-colors">
                          {dress.name}
                        </div>
                        <div className="text-[10px] font-bold text-muted-foreground mt-0.5">
                          {getIntendedUseLabel(dress.intended_use)} • {formatCurrency(dress.base_price || 0)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {filteredDresses.length === 0 && (
                <div className="text-center py-12">
                  <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="font-bold text-muted-foreground">לא נמצאו שמלות תואמות</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
