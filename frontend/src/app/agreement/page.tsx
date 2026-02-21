"use client";

/**
 * Public Rental Agreement Signing Page
 * 
 * Purpose: Allow customers to sign rental agreements digitally.
 * Displays terms, captures signature, and saves the agreement.
 */

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agreementsApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { normalizePhoneInput } from "@/lib/utils";
import { FileText, CheckCircle, Eraser } from "lucide-react";

interface Terms {
  terms: string[];
  cancellationPolicy: string[];
  businessName: string;
  businessPhone: string;
}

interface PrefillData {
  fullName: string;
  phone: string;
  email: string;
  eventDate: string;
  orderDetails: {
    orderId: number;
    orderType: string;
    orderSummary: string;
    items: Array<{
      id: number;
      dressName: string;
      wearerName: string;
      itemType: string;
      finalPrice: number;
    }>;
  };
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  rental: "השכרה",
  sewing_for_rental: "תפירה שנשארת בהשכרה",
  sewing: "תפירה",
  sale: "מכירה",
};

function getItemTypeLabel(type: string) {
  return ITEM_TYPE_LABELS[type] || type || "פריט";
}

export default function AgreementPage() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [token, setToken] = useState("");
  const [terms, setTerms] = useState<Terms | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [orderDetails, setOrderDetails] = useState<PrefillData["orderDetails"] | null>(null);

  // Form data
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("token") || "";
    setToken(fromUrl.trim());
  }, []);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await agreementsApi.terms();
        if (response.success && response.data) {
          setTerms(response.data as Terms);
        }
      } catch (error) {
        console.error("Failed to load terms:", error);
      }
    };
    fetchTerms();
  }, []);

  useEffect(() => {
    if (!token) return;

    const fetchPrefill = async () => {
      setPrefillLoading(true);
      setPrefillError("");
      try {
        const response = await agreementsApi.prefill(token);
        if (!response.success || !response.data) {
          throw new Error(response.message || "לא ניתן לטעון פרטי הזמנה לחתימה");
        }

        const data = response.data as PrefillData;
        setFullName(data.fullName || "");
        setPhone(data.phone || "");
        setEmail(data.email || "");
        setEventDate((data.eventDate || "").split("T")[0]);
        setOrderDetails(data.orderDetails || null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "קישור חתימה לא תקין";
        setPrefillError(message);
        toast({
          title: "שגיאה",
          description: message,
          variant: "destructive",
        });
      } finally {
        setPrefillLoading(false);
      }
    };

    fetchPrefill();
  }, [token, toast]);

  // Canvas drawing functions
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const getSignatureData = () => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !phone.trim()) {
      toast({
        title: "שגיאה",
        description: "נא למלא את כל השדות הנדרשים",
        variant: "destructive",
      });
      return;
    }

    if (!termsAccepted) {
      toast({
        title: "שגיאה",
        description: "נא לאשר את תנאי ההסכם",
        variant: "destructive",
      });
      return;
    }

    if (!hasSignature) {
      toast({
        title: "שגיאה",
        description: "נא לחתום על ההסכם",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await agreementsApi.sign({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        event_date: eventDate || undefined,
        signature_data: getSignatureData(),
        token: token || undefined,
      });

      if (response.success) {
        setSuccess(true);
      }
    } catch (error) {
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בחתימה על ההסכם",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">ההסכם נחתם בהצלחה!</h2>
            <p className="text-muted-foreground mb-4">
              תודה, {fullName}. ההסכם נשמר במערכת.
            </p>
            <p className="text-sm text-muted-foreground">
              העתק של ההסכם יישלח לאימייל שלך (אם צוין).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-primary/5 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">הסכם</CardTitle>
            <CardDescription>
              {terms?.businessName || "Your Business Name"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Info */}
              <div className="space-y-4">
                <h3 className="font-medium">פרטים אישיים</h3>
                <div>
                  <label className="text-sm font-medium">שם מלא *</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="שם פרטי ומשפחה"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">טלפון *</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                    placeholder="050-1234567"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">אימייל</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">תאריך האירוע</label>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Order Summary (read-only for customer) */}
              {orderDetails && (
                <div className="space-y-4 border-t pt-6">
                  <h3 className="font-medium">פרטי ההזמנה</h3>
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    {orderDetails.items.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-1">סיכום קצר</p>
                        <p className="text-sm text-muted-foreground">
                          {orderDetails.items
                            .map((item) => {
                              const typeLabel = getItemTypeLabel(item.itemType);
                              const wearer = item.wearerName ? ` (${item.wearerName})` : "";
                              return `${typeLabel}${wearer}`;
                            })
                            .join(", ")}
                        </p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {orderDetails.items.map((item) => (
                        <div key={item.id} className="rounded-md bg-white p-3 border text-sm">
                          <p className="font-medium">
                            {getItemTypeLabel(item.itemType)}
                            {item.wearerName ? ` - ${item.wearerName}` : ""}
                          </p>
                          <p className="text-muted-foreground">
                            מחיר: ₪{(item.finalPrice || 0).toLocaleString("he-IL")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Terms */}
              {terms && (
                <div className="space-y-4 border-t pt-6">
                  <h3 className="font-medium">תנאי ההשכרה</h3>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto text-sm space-y-2">
                    <ol className="list-decimal list-inside space-y-2">
                      {terms.terms.map((term, index) => (
                        <li key={index}>{term}</li>
                      ))}
                    </ol>
                    <div className="mt-4 pt-4 border-t">
                      <p className="font-medium mb-2">מדיניות ביטולים:</p>
                      <ol className="list-decimal list-inside space-y-2">
                        {terms.cancellationPolicy.map((policy, index) => (
                          <li key={index}>{policy}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-sm">
                      קראתי את התנאים לעיל ואני מסכימה להם
                    </span>
                  </label>
                </div>
              )}

              {/* Signature */}
              <div className="space-y-4 border-t pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">חתימה</h3>
                  {hasSignature && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSignature}
                      className="gap-1"
                    >
                      <Eraser className="h-4 w-4" />
                      נקה
                    </Button>
                  )}
                </div>
                <div className="border-2 border-dashed rounded-lg bg-white">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  חתמי כאן באמצעות העכבר או האצבע
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || prefillLoading || Boolean(prefillError) || !termsAccepted || !hasSignature}
              >
                {loading ? "שולח..." : "חתום על ההסכם"}
              </Button>
              {prefillLoading && (
                <p className="text-xs text-muted-foreground text-center">טוען פרטי הזמנה...</p>
              )}
              {prefillError && (
                <p className="text-xs text-destructive text-center">{prefillError}</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
