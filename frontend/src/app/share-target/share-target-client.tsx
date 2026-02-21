"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { blobToBase64, saveSharedUploadPayload, type SharedUploadContext } from "@/lib/shared-upload";
import { Check, FileImage, Receipt, Shirt, UploadCloud, Wallet } from "lucide-react";

const TARGET_OPTIONS: Array<{
  context: SharedUploadContext;
  title: string;
  description: string;
  href: string;
}> = [
  {
    context: "order_deposit",
    title: "אסמכתא להזמנה חדשה",
    description: "יפתח טופס הזמנה חדשה עם הקובץ מצורף לתשלום מקדמה.",
    href: "/dashboard/orders/new?shared_upload=1&share_context=order_deposit",
  },
  {
    context: "transaction_income",
    title: "אסמכתא להכנסה חדשה",
    description: "יפתח טופס תנועה חדשה כהכנסה עם הקובץ טעון מראש.",
    href: "/dashboard/transactions/new?type=income&shared_upload=1&share_context=transaction_income",
  },
  {
    context: "transaction_expense",
    title: "אסמכתא להוצאה חדשה",
    description: "יפתח טופס תנועה חדשה כהוצאה עם הקובץ טעון מראש.",
    href: "/dashboard/transactions/new?type=expense&shared_upload=1&share_context=transaction_expense",
  },
  {
    context: "dress_add",
    title: "הוספת שמלה חדשה",
    description: "יפתח טופס שמלה חדשה ויטען את התמונה אוטומטית.",
    href: "/dashboard/dresses?openForm=1&shared_upload=1&share_context=dress_add",
  },
  {
    context: "dress_edit",
    title: "עדכון תמונת שמלה קיימת",
    description: "יפתח מלאי שמלות לבחירת שמלה לעדכון התמונה.",
    href: "/dashboard/dresses?shared_upload=1&share_context=dress_edit",
  },
];

function getOptionIcon(context: SharedUploadContext) {
  switch (context) {
    case "order_deposit":
      return <Receipt className="h-5 w-5 text-green-600" />;
    case "transaction_income":
    case "transaction_expense":
      return <Wallet className="h-5 w-5 text-blue-600" />;
    case "dress_add":
    case "dress_edit":
      return <Shirt className="h-5 w-5 text-purple-600" />;
    default:
      return <UploadCloud className="h-5 w-5" />;
  }
}

export function ShareTargetClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");
  const hasLoadedRef = useRef(false);

  const sharedId = searchParams.get("sharedId");
  const error = searchParams.get("error");

  const isImage = useMemo(() => fileType.startsWith("image/"), [fileType]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadSharedFile = async () => {
      if (error) {
        setLoading(false);
        toast({
          title: "שיתוף לא הושלם",
          description: "לא התקבל קובץ תקין מתפריט השיתוף.",
          variant: "destructive",
        });
        return;
      }

      if (!sharedId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/share-target/data/${encodeURIComponent(sharedId)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Shared data not found (${response.status})`);
        }

        const blob = await response.blob();
        const encodedName = response.headers.get("x-file-name");
        const resolvedName = encodedName ? decodeURIComponent(encodedName) : `shared-file-${sharedId}`;
        const resolvedType = blob.type || "application/octet-stream";
        const base64 = await blobToBase64(blob);

        saveSharedUploadPayload({
          id: sharedId,
          fileName: resolvedName,
          mimeType: resolvedType,
          base64,
          createdAt: Date.now(),
          source: "android_share_target",
        });

        setFileName(resolvedName);
        setFileType(resolvedType);
        if (resolvedType.startsWith("image/")) {
          setFilePreviewUrl(URL.createObjectURL(blob));
        }
        setReady(true);
      } catch (loadError) {
        console.error(loadError);
        toast({
          title: "שגיאה בטעינת הקובץ",
          description: "לא הצלחנו לטעון את הקובץ מהשיתוף.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadSharedFile();
  }, [error, sharedId, toast]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-2">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <FileImage className="h-5 w-5" />
              <h1 className="font-black text-xl">שיתוף קובץ למערכת</h1>
            </div>

            {loading && <p className="text-sm text-muted-foreground">טוען את הקובץ מתפריט השיתוף...</p>}

            {!loading && !ready && (
              <p className="text-sm text-destructive">לא זוהה קובץ לשיוך. נסי לשתף מחדש.</p>
            )}

            {ready && (
              <div className="space-y-3">
                <p className="text-sm font-bold">הקובץ מוכן לשיוך:</p>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-sm font-bold">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{fileType}</p>
                </div>
                {isImage && filePreviewUrl && (
                  <div className="rounded-xl overflow-hidden border bg-muted/10">
                    <img src={filePreviewUrl} alt="תצוגה מקדימה" className="w-full max-h-72 object-cover" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardContent className="p-6 space-y-3">
            <h2 className="font-black text-lg">לאן לשייך את הקובץ?</h2>
            {TARGET_OPTIONS.map((option) => (
              <button
                key={option.context}
                type="button"
                disabled={!ready}
                onClick={() => router.push(option.href)}
                className="w-full rounded-xl border-2 p-4 text-right transition-all hover:bg-muted/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getOptionIcon(option.context)}</div>
                  <div className="flex-1">
                    <p className="font-bold">{option.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                  </div>
                  <Check className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => router.push("/dashboard")}>
          מעבר ללוח הבקרה
        </Button>
      </div>
    </div>
  );
}
