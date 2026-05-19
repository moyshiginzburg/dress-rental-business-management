"use client";

/**
 * Date Range Filter Component
 * 
 * Purpose: Provides a filter for selecting date ranges with preset options.
 * Used in orders and transactions pages for filtering by dates.
 * 
 * Method: Renders date inputs for from/to dates with quick preset buttons.
 * Preset options: היום, השבוע, החודש, חודש קודם, רבעון, רבעון קודם, השנה, שנה שעברה, טווח מותאם.
 * Calls onChange callback when dates are updated.
 *
 * Quarter logic:
 *   Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
 *   'רבעון'       → start of current quarter .. today (inclusive).
 *   'רבעון קודם' → full previous quarter (first day .. last day).
 *   'השנה'        → Jan 1 of current year .. today (inclusive).
 *   'שנה שעברה'  → Jan 1 .. Dec 31 of the previous year.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, X } from "lucide-react";
import { formatDateInput } from "@/lib/utils";

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
    { label: "רבעון", getValue: () => getThisQuarter() },
    { label: "רבעון קודם", getValue: () => getLastQuarter() },
    { label: "השנה", getValue: () => getThisYear() },
    { label: "שנה שעברה", getValue: () => getLastYear() },
] as const;

// Helper functions to calculate date ranges
function getToday(): { from: string; to: string } {
    const today = formatDateInput(new Date());
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
        from: formatDateInput(startOfWeek),
        to: formatDateInput(endOfWeek),
    };
}

function getThisMonth(): { from: string; to: string } {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    return {
        from: formatDateInput(startOfMonth),
        to: formatDateInput(endOfMonth),
    };
}

function getLastMonth(): { from: string; to: string } {
    const today = new Date();
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    return {
        from: formatDateInput(startOfLastMonth),
        to: formatDateInput(endOfLastMonth),
    };
}

/**
 * Returns the first month (0-indexed) of the quarter that contains the given month.
 * Q1 → 0 (Jan), Q2 → 3 (Apr), Q3 → 6 (Jul), Q4 → 9 (Oct).
 */
function quarterStartMonth(month: number): number {
    return Math.floor(month / 3) * 3;
}

/** Current quarter: from the 1st of the quarter's first month up to today (inclusive). */
function getThisQuarter(): { from: string; to: string } {
    const today = new Date();
    const startMonth = quarterStartMonth(today.getMonth());
    const startOfQuarter = new Date(today.getFullYear(), startMonth, 1);

    return {
        from: formatDateInput(startOfQuarter),
        to: formatDateInput(today), // up to today, not end of quarter
    };
}

/** Previous quarter: the full quarter before the current one (first day .. last day). */
function getLastQuarter(): { from: string; to: string } {
    const today = new Date();
    const currentQuarterStart = quarterStartMonth(today.getMonth());

    let lastQuarterStartMonth: number;
    let lastQuarterYear: number;

    if (currentQuarterStart === 0) {
        // Current quarter is Q1 — previous quarter is Q4 of last year
        lastQuarterStartMonth = 9; // October
        lastQuarterYear = today.getFullYear() - 1;
    } else {
        lastQuarterStartMonth = currentQuarterStart - 3;
        lastQuarterYear = today.getFullYear();
    }

    const startOfLastQuarter = new Date(lastQuarterYear, lastQuarterStartMonth, 1);
    // End of last quarter = last day of (lastQuarterStartMonth + 2), i.e. day 0 of month+3
    const endOfLastQuarter = new Date(lastQuarterYear, lastQuarterStartMonth + 3, 0);

    return {
        from: formatDateInput(startOfLastQuarter),
        to: formatDateInput(endOfLastQuarter),
    };
}

/** Current year: from Jan 1 of this year up to today (inclusive). */
function getThisYear(): { from: string; to: string } {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1); // January 1
    return {
        from: formatDateInput(startOfYear),
        to: formatDateInput(today),
    };
}

/** Previous year: full calendar year (Jan 1 .. Dec 31). */
function getLastYear(): { from: string; to: string } {
    const lastYear = new Date().getFullYear() - 1;
    const startOfLastYear = new Date(lastYear, 0, 1);  // Jan 1
    const endOfLastYear = new Date(lastYear, 11, 31);  // Dec 31
    return {
        from: formatDateInput(startOfLastYear),
        to: formatDateInput(endOfLastYear),
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
