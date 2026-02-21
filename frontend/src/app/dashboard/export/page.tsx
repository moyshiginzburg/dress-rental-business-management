"use client";

/**
 * Data Export Page
 *
 * Purpose: Download filtered database datasets as CSV files.
 * Behavior: Fetches exportable datasets + filter definitions from backend.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { exportApi, type ExportDataset, type ExportFilterDefinition } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Database, Download, Files, Loader2 } from "lucide-react";

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<ExportDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  );

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await exportApi.datasets();
      if (!response.success || !response.data) {
        throw new Error("לא ניתן לטעון את רשימת הייצוא");
      }

      const payload = response.data as { datasets: ExportDataset[] };
      const list = payload.datasets || [];
      setDatasets(list);

      if (list.length > 0) {
        setSelectedDatasetId((prev) => prev || list[0].id);
      }
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בטעינת נתוני ייצוא",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (!selectedDataset) return;

    setFilterValues((prev) => {
      const next = { ...prev };
      for (const filter of selectedDataset.filters) {
        if (next[filter.key] === undefined) {
          next[filter.key] = filter.inputType === "checkbox" ? "false" : "";
        }
      }
      return next;
    });
  }, [selectedDataset]);

  const updateFilter = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const collectFilters = (dataset: ExportDataset) => {
    const filters: Record<string, string> = {};

    for (const filter of dataset.filters) {
      const rawValue = filterValues[filter.key];
      if (filter.inputType === "checkbox") {
        if (rawValue === "true") {
          filters[filter.key] = "true";
        }
        continue;
      }

      const normalized = (rawValue || "").trim();
      if (normalized) {
        filters[filter.key] = normalized;
      }
    }

    return filters;
  };

  const exportOneDataset = async (dataset: ExportDataset) => {
    const { blob, fileName } = await exportApi.downloadCsv(dataset.id, collectFilters(dataset));
    triggerDownload(blob, fileName);
  };

  const handleExportSelected = async () => {
    if (!selectedDataset) return;

    setExporting(true);
    try {
      await exportOneDataset(selectedDataset);
      toast({
        title: "ייצוא הושלם",
        description: `הקובץ של "${selectedDataset.label}" הורד בהצלחה`,
      });
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בייצוא הקובץ",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    if (datasets.length === 0) return;

    setExportingAll(true);
    try {
      for (const dataset of datasets) {
        await exportOneDataset(dataset);
        // Keep a small delay to reduce browser blocking on multiple downloads.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      toast({
        title: "ייצוא הושלם",
        description: `יוצאו ${datasets.length} קבצי CSV`,
      });
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בייצוא כל הנתונים",
        variant: "destructive",
      });
    } finally {
      setExportingAll(false);
    }
  };

  const clearSelectedFilters = () => {
    if (!selectedDataset) return;

    setFilterValues((prev) => {
      const next = { ...prev };
      for (const filter of selectedDataset.filters) {
        next[filter.key] = filter.inputType === "checkbox" ? "false" : "";
      }
      return next;
    });
  };

  const renderFilterInput = (filter: ExportFilterDefinition) => {
    const value = filterValues[filter.key] ?? (filter.inputType === "checkbox" ? "false" : "");

    if (filter.inputType === "select") {
      return (
        <select
          value={value}
          onChange={(e) => updateFilter(filter.key, e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">הכל</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (filter.inputType === "checkbox") {
      return (
        <label className="flex items-center gap-2 h-10">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => updateFilter(filter.key, e.target.checked ? "true" : "false")}
            className="h-4 w-4"
          />
          <span className="text-sm text-muted-foreground">כן</span>
        </label>
      );
    }

    return (
      <Input
        type={filter.inputType}
        value={value}
        onChange={(e) => updateFilter(filter.key, e.target.value)}
        placeholder={filter.placeholder || undefined}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-7 w-7" />
            ייצוא נתונים
          </h1>
          <p className="text-muted-foreground">ייצוא CSV מלא מהדאטה בייס עם סינון לפי סוג הנתון</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportAll}
          disabled={datasets.length === 0 || exportingAll || exporting}
          className="gap-2"
        >
          {exportingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}
          ייצוא כל הדאטה
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>בחירת dataset</CardTitle>
          <CardDescription>בחרי אילו נתונים להוציא, ואז הגדירי סינון לפני ההורדה</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.label} ({dataset.totalRows.toLocaleString()} רשומות)
              </option>
            ))}
          </select>

          {selectedDataset && (
            <div className="text-sm text-muted-foreground">
              {selectedDataset.description}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDataset && (
        <Card>
          <CardHeader>
            <CardTitle>סינונים לייצוא</CardTitle>
            <CardDescription>המסננים נבחרו לפי מבנה הנתונים והזרימות העסקיות בפועל</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedDataset.filters.length === 0 ? (
              <p className="text-sm text-muted-foreground">ל-dataset זה אין מסננים ייעודיים.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDataset.filters.map((filter) => (
                  <div key={filter.key} className="space-y-1">
                    <label className="text-sm font-medium">{filter.label}</label>
                    {renderFilterInput(filter)}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleExportSelected}
                disabled={exporting || exportingAll}
                className="gap-2"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                ייצוא CSV
              </Button>
              <Button
                variant="outline"
                onClick={clearSelectedFilters}
                disabled={exporting || exportingAll}
              >
                איפוס מסננים
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
