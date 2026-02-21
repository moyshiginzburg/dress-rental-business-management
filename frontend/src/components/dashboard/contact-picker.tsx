"use client";

/**
 * Contact Picker Component
 * 
 * Purpose: Provides a button to import contact information using the Web Contact Picker API.
 * Operation: Checks for browser support, requests permission, and returns name and phone only.
 * Note: Email is intentionally excluded to prevent OOM (Out Of Memory) crashes on Android devices with large contact lists.
 * Language: Feminine.
 */

import { useState, useEffect } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface ContactInfo {
  name: string;
  phone: string;
  email: string;
}

interface ContactPickerProps {
  onContactSelect: (contact: ContactInfo) => void;
  variant?: "outline" | "ghost" | "default";
  className?: string;
  label?: string;
  icon?: React.ReactNode;
}

export function ContactPicker({ 
  onContactSelect, 
  variant = "outline", 
  className = "",
  label = "ייבוא מאנשי קשר",
  icon
}: ContactPickerProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check if the Contact Picker API is supported
    setIsSupported('contacts' in navigator && 'ContactsManager' in window);
  }, []);

  const handlePickContact = async () => {
    if (!isSupported) return;

    setLoading(true);
    
    // Small delay to ensure UI updates before heavy native call
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // CRITICAL OPTIMIZATION: Request ONLY name and tel.
      // Requesting 'email' causes crashes on devices with 20k+ contacts due to memory limits.
      const props = ['name', 'tel']; 
      const opts = { multiple: false };
      
      // @ts-ignore - Contact Picker API is not in standard TS types yet
      const contacts = await navigator.contacts.select(props, opts);

      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const name = contact.name?.[0] || "";
        const phone = contact.tel?.[0]?.replace(/[^\d+]/g, "") || ""; // Clean non-numeric except +
        
        // Email is intentionally empty to prevent crash
        const email = ""; 

        onContactSelect({ name, phone, email });
        
        toast({
          title: "ייבוא הושלם",
          description: `הפרטים של ${name} הוכנסו בהצלחה (ללא אימייל)`,
        });
      }
    } catch (err) {
      console.error("Contact picker error:", err);
      // Don't show toast for user cancellations (AbortError)
      if (err instanceof Error && err.name !== 'AbortError') {
        toast({
          title: "שגיאה",
          description: "לא ניתן לגשת לאנשי הקשר",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handlePickContact}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin ml-2" />
      ) : (
        icon || <UserPlus className="h-4 w-4 ml-2" />
      )}
      {label}
    </Button>
  );
}
