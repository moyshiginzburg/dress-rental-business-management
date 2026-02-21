"use client";

/**
 * Global Search Component
 * 
 * Purpose: Provides a global search modal accessible via Ctrl+K shortcut.
 * Searches across customers, dresses, and orders simultaneously.
 * 
 * Method: Opens a modal with a search input, fetches results from multiple APIs,
 * and displays categorized results with navigation links.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { customersApi, dressesApi, ordersApi } from "@/lib/api";
import { formatCurrency, debounce } from "@/lib/utils";
import {
    Search,
    X,
    Users,
    ShoppingBag,
    FileText,
    ArrowLeft,
} from "lucide-react";

interface SearchResult {
    id: number;
    type: "customer" | "dress" | "order";
    title: string;
    subtitle?: string;
    href: string;
}

export function GlobalSearch() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Handle keyboard shortcut (Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setSearch("");
            setResults([]);
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Search function
    const performSearch = useCallback(async (query: string) => {
        if (!query.trim() || query.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const [customersRes, dressesRes, ordersRes] = await Promise.all([
                customersApi.list({ search: query, limit: 5 }),
                dressesApi.list({ search: query, limit: 5 }),
                ordersApi.list({ page: 1 }),
            ]);

            const newResults: SearchResult[] = [];

            // Process customers
            if (customersRes.success && customersRes.data) {
                const data = customersRes.data as { customers: { id: number; name: string; phone?: string }[] };
                data.customers.forEach((c) => {
                    newResults.push({
                        id: c.id,
                        type: "customer",
                        title: c.name,
                        subtitle: c.phone || undefined,
                        href: `/dashboard/customers`,
                    });
                });
            }

            // Process dresses
            if (dressesRes.success && dressesRes.data) {
                const data = dressesRes.data as { dresses: { id: number; name: string; base_price?: number }[] };
                data.dresses.forEach((d) => {
                    newResults.push({
                        id: d.id,
                        type: "dress",
                        title: d.name,
                        subtitle: d.base_price ? formatCurrency(d.base_price) : undefined,
                        href: `/dashboard/dresses`,
                    });
                });
            }

            // Process orders - filter client-side by customer name
            if (ordersRes.success && ordersRes.data) {
                const data = ordersRes.data as { orders: { id: number; customer_name: string; total_price: number; status: string }[] };
                data.orders
                    .filter((o) => o.customer_name?.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 5)
                    .forEach((o) => {
                        newResults.push({
                            id: o.id,
                            type: "order",
                            title: `הזמנה #${o.id} - ${o.customer_name}`,
                            subtitle: formatCurrency(o.total_price),
                            href: `/dashboard/orders`,
                        });
                    });
            }

            setResults(newResults);
            setSelectedIndex(0);
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search
    const debouncedSearch = useCallback(
        debounce((q: unknown) => performSearch(q as string), 300),
        [performSearch]
    );

    useEffect(() => {
        debouncedSearch(search);
    }, [search, debouncedSearch]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter" && results.length > 0) {
            e.preventDefault();
            const selected = results[selectedIndex];
            if (selected) {
                router.push(selected.href);
                setIsOpen(false);
            }
        }
    };

    // Get icon for result type
    const getIcon = (type: string) => {
        switch (type) {
            case "customer":
                return <Users className="h-4 w-4" />;
            case "dress":
                return <ShoppingBag className="h-4 w-4" />;
            case "order":
                return <FileText className="h-4 w-4" />;
            default:
                return <Search className="h-4 w-4" />;
        }
    };

    // Get Hebrew label for result type
    const getTypeLabel = (type: string) => {
        switch (type) {
            case "customer":
                return "לקוחה";
            case "dress":
                return "שמלה";
            case "order":
                return "הזמנה";
            default:
                return "";
        }
    };

    if (!isOpen) {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="gap-2 hidden lg:flex"
            >
                <Search className="h-4 w-4" />
                <span>חיפוש</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </Button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-card rounded-lg shadow-lg border mx-4">
                {/* Search Input */}
                <div className="flex items-center gap-2 p-4 border-b">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <Input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="חיפוש לקוחות, שמלות, הזמנות..."
                        className="border-0 focus-visible:ring-0 text-lg"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsOpen(false)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                    )}

                    {!loading && search.length >= 2 && results.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            לא נמצאו תוצאות עבור &quot;{search}&quot;
                        </div>
                    )}

                    {!loading && results.length > 0 && (
                        <div className="space-y-1">
                            {results.map((result, index) => (
                                <button
                                    key={`${result.type}-${result.id}`}
                                    onClick={() => {
                                        router.push(result.href);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${index === selectedIndex
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-muted"
                                        }`}
                                >
                                    <div className={`p-2 rounded-md ${index === selectedIndex
                                        ? "bg-primary-foreground/20"
                                        : "bg-muted"
                                        }`}>
                                        {getIcon(result.type)}
                                    </div>
                                    <div className="flex-1 text-right">
                                        <p className="font-medium">{result.title}</p>
                                        {result.subtitle && (
                                            <p className={`text-sm ${index === selectedIndex
                                                ? "text-primary-foreground/70"
                                                : "text-muted-foreground"
                                                }`}>
                                                {result.subtitle}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded ${index === selectedIndex
                                        ? "bg-primary-foreground/20"
                                        : "bg-muted"
                                        }`}>
                                        {getTypeLabel(result.type)}
                                    </span>
                                    <ArrowLeft className="h-4 w-4 opacity-50" />
                                </button>
                            ))}
                        </div>
                    )}

                    {!loading && search.length < 2 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            הקלידי לפחות 2 תווים לחיפוש
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="border-t p-2 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-2">
                        <kbd className="px-2 py-1 rounded bg-muted">↑↓</kbd>
                        <span>לניווט</span>
                    </div>
                    <div className="flex gap-2">
                        <kbd className="px-2 py-1 rounded bg-muted">Enter</kbd>
                        <span>לבחירה</span>
                    </div>
                    <div className="flex gap-2">
                        <kbd className="px-2 py-1 rounded bg-muted">Esc</kbd>
                        <span>לסגירה</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
