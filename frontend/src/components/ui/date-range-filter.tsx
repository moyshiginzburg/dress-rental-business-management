"use client";

/**
 * Date Range Filter Component
 * 
 * Purpose: Provides a filter for selecting date ranges with preset options.
 * Used in orders and transactions pages for filtering by dates.
 * 
 * Method: Renders date inputs for from/to dates with quick preset buttons.
 * Calls onChange callback when dates are updated.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, X } from "lucide-react";

interface DateRangeFilterProps {
    onDateChange: (dateFrom: string | null, dateTo: string | null) => void;
    dateFrom: string | null;
    dateTo: string | null;
}

// Hebrew labels for preset date ranges
const presets = [
    { label: "היום", getValue: () => getToday() },
    { label: "השבוע", getValue: () => getThisWeek() },
    { label: "החודש", getValue: () => getThisMonth() },
    { label: "חודש קודם", getValue: () => getLastMonth() },
] as const;

// Helper functions to calculate date ranges
function getToday(): { from: string; to: string } {
    const today = new Date().toISOString().split("T")[0];
    return { from: today, to: today };
}

function getThisWeek(): { from: string; to: string } {
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Sunday is 0 in JS, move to Sunday start
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return {
        from: startOfWeek.toISOString().split("T")[0],
        to: endOfWeek.toISOString().split("T")[0],
    };
}

function getThisMonth(): { from: string; to: string } {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    return {
        from: startOfMonth.toISOString().split("T")[0],
        to: endOfMonth.toISOString().split("T")[0],
    };
}

function getLastMonth(): { from: string; to: string } {
    const today = new Date();
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    return {
        from: startOfLastMonth.toISOString().split("T")[0],
        to: endOfLastMonth.toISOString().split("T")[0],
    };
}

export function DateRangeFilter({ onDateChange, dateFrom, dateTo }: DateRangeFilterProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handlePresetClick = useCallback((getValue: () => { from: string; to: string }) => {
        const { from, to } = getValue();
        onDateChange(from, to);
    }, [onDateChange]);

    const handleClear = useCallback(() => {
        onDateChange(null, null);
    }, [onDateChange]);

    const hasFilter = dateFrom || dateTo;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1">
                {presets.map((preset) => (
                    <Button
                        key={preset.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handlePresetClick(preset.getValue)}
                        className="text-xs h-8"
                    >
                        {preset.label}
                    </Button>
                ))}
            </div>

            {/* Custom date range toggle */}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="gap-1 text-xs h-8"
            >
                <Calendar className="h-3 w-3" />
                טווח מותאם
            </Button>

            {/* Custom date inputs */}
            {isOpen && (
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={dateFrom || ""}
                        onChange={(e) => onDateChange(e.target.value || null, dateTo)}
                        className="h-8 w-32 text-xs"
                        dir="ltr"
                        placeholder="מתאריך"
                    />
                    <span className="text-xs text-muted-foreground">עד</span>
                    <Input
                        type="date"
                        value={dateTo || ""}
                        onChange={(e) => onDateChange(dateFrom, e.target.value || null)}
                        className="h-8 w-32 text-xs"
                        dir="ltr"
                        placeholder="עד תאריך"
                    />
                </div>
            )}

            {/* Clear filter */}
            {hasFilter && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="gap-1 text-xs h-8 text-muted-foreground hover:text-destructive"
                >
                    <X className="h-3 w-3" />
                    נקה
                </Button>
            )}
        </div>
    );
}
