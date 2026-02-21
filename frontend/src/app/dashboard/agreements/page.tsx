"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { agreementsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ExternalLink, FileSignature, FileText, Loader2, PenLine } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface AgreementRecord {
  id: number;
  order_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  event_date: string | null;
  agreed_at: string | null;
  signature_url: string | null;
  pdf_url: string | null;
  created_at: string;
}

function resolveFileUrl(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/")) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";
  if (/^https?:\/\//i.test(apiBase)) {
    const backendOrigin = apiBase.replace(/\/api\/?$/, "");
    return `${backendOrigin}${pathOrUrl}`;
  }

  return pathOrUrl;
}

export default function AgreementsPage() {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgreements = useCallback(async () => {
    setLoading(true);
    try {
      const response = await agreementsApi.list(1, 200);
      if (!response.success || !response.data) {
        throw new Error(response.message || "לא ניתן לטעון הסכמים");
      }

      const payload = response.data as {
        agreements: AgreementRecord[];
      };
      setAgreements(payload.agreements || []);
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "לא ניתן לטעון את ההסכמים",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAgreements();
  }, [loadAgreements]);

  const stats = useMemo(() => {
    return {
      total: agreements.length,
      withPdf: agreements.filter((agreement) => !!agreement.pdf_url).length,
      withSignature: agreements.filter((agreement) => !!agreement.signature_url).length,
    };
  }, [agreements]);

  const openLink = (url: string | null, label: string) => {
    if (!url) {
      toast({
        title: "לא נמצא קובץ",
        description: `אין ${label} עבור ההסכם הזה`,
        variant: "destructive",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSignature className="h-7 w-7" />
            הסכמים חתומים
          </h1>
          <p className="text-muted-foreground">רשימת כל ההסכמים והגישה ל-PDF ולחתימה הדיגיטלית</p>
        </div>
        <Button variant="outline" onClick={loadAgreements}>רענון</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">סה&quot;כ הסכמים</p>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">עם חתימה דיגיטלית</p>
            <p className="text-3xl font-bold">{stats.withSignature}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">עם PDF שמור</p>
            <p className="text-3xl font-bold">{stats.withPdf}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>רשימת הסכמים</CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">עדיין אין הסכמים חתומים.</p>
          ) : (
            <div className="space-y-3">
              {agreements.map((agreement) => {
                const signatureUrl = resolveFileUrl(agreement.signature_url);
                const pdfUrl = resolveFileUrl(agreement.pdf_url);

                return (
                  <div
                    key={agreement.id}
                    className="border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold">{agreement.customer_name}</div>
                      <div className="text-sm text-muted-foreground">
                        הזמנה: {agreement.order_id || "ללא"} | נחתם: {agreement.agreed_at ? formatDateTime(agreement.agreed_at) : "-"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        אירוע: {agreement.event_date || "-"} | טלפון: {agreement.customer_phone || "-"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLink(signatureUrl, "חתימה")}
                        disabled={!signatureUrl}
                      >
                        <PenLine className="h-4 w-4 ms-1" />
                        צפייה בחתימה
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLink(pdfUrl, "PDF")}
                        disabled={!pdfUrl}
                      >
                        <FileText className="h-4 w-4 ms-1" />
                        צפייה ב-PDF
                      </Button>
                      {pdfUrl && (
                        <Button
                          size="sm"
                          onClick={() => openLink(pdfUrl, "PDF")}
                        >
                          <ExternalLink className="h-4 w-4 ms-1" />
                          פתיחה
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

