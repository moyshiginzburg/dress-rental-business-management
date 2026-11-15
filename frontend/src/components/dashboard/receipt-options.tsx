"use client";

/**
 * Receipt Options (SmartInvoice)
 *
 * Purpose: The "issue a receipt?" block shown in every income form (new
 * transaction, order deposit payments, late issue from the edit page).
 * The owner decides per income whether a receipt is issued, the customer name
 * printed on it, what it is for, and an optional note printed on the receipt.
 *
 * Operation:
 *   - useReceiptsStatus() asks the backend once (SWR-cached) whether receipts
 *     are enabled. When disabled, nothing renders.
 *   - ReceiptOptionsState keeps the choice plus "touched" flags. The checkbox
 *     is ON by default for every payment method (cash included) and can be
 *     unchecked per payment; until she edits "for what" it follows the income
 *     category ("שמלה" for orders and other, "תיקונים" for repairs); until she
 *     edits the name it follows the selected customer (her saved receipt
 *     name, else her app name - see useReceiptCustomerName()). Selecting a
 *     different customer resets the name to that customer's default.
 *     withReceiptDefaults() applies those rules; the forms call it whenever
 *     the payment method, category or customer changes.
 *   - The backend remembers the chosen name in customers.receipt_name.
 *   - toReceiptRequest() turns the state into the API payload (or undefined);
 *     receiptValidationError() returns a Hebrew message when a field is missing.
 * Language: Feminine Hebrew UI.
 */

import useSWR from "swr";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { receiptsApi, type ReceiptRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ReceiptOptionsState {
  issue: boolean;
  description: string;
  notes: string;
  customerName: string;
  issueTouched: boolean;
  descriptionTouched: boolean;
  customerNameTouched: boolean;
  /** Which customer customerName belongs to ("c<id>" or "new"); a change resets the name. */
  customerKey: string;
}

/** The selected customer as seen by the receipt options. */
export interface ReceiptCustomer {
  key: string;
  name: string;
}

/** Income category ('order' | 'repair' | 'other') -> default "for what" line. */
export function defaultReceiptDescription(category: string): string {
  return category === "repair" ? "תיקונים" : "שמלה";
}

/** Every payment (any method, cash included) defaults to issuing a receipt; the user can uncheck it. */
export function defaultReceiptIssue(): boolean {
  return true;
}

export function initialReceiptOptions(paymentMethod: string, category: string, customer?: ReceiptCustomer): ReceiptOptionsState {
  return {
    issue: defaultReceiptIssue(),
    description: defaultReceiptDescription(category),
    notes: "",
    customerName: customer?.name || "",
    issueTouched: false,
    descriptionTouched: false,
    customerNameTouched: false,
    customerKey: customer?.key || "",
  };
}

/** Re-apply the defaults for the fields the user has not changed by hand. */
export function withReceiptDefaults(
  state: ReceiptOptionsState,
  paymentMethod: string,
  category: string,
  customer?: ReceiptCustomer
): ReceiptOptionsState {
  const issue = state.issueTouched ? state.issue : defaultReceiptIssue();
  const description = state.descriptionTouched ? state.description : defaultReceiptDescription(category);
  // A different customer was selected: her default name replaces whatever was typed for the previous one.
  const customerChanged = !!customer && customer.key !== state.customerKey;
  const customerNameTouched = customerChanged ? false : state.customerNameTouched;
  const customerName = customerNameTouched ? state.customerName : (customer?.name ?? state.customerName);
  const customerKey = customer?.key ?? state.customerKey;
  if (
    issue === state.issue && description === state.description && customerName === state.customerName &&
    customerNameTouched === state.customerNameTouched && customerKey === state.customerKey
  ) return state;
  return { ...state, issue, description, customerName, customerNameTouched, customerKey };
}

/** API payload for the create endpoints; undefined when no receipt should be issued. */
export function toReceiptRequest(state: ReceiptOptionsState, enabled: boolean): ReceiptRequest | undefined {
  if (!enabled || !state.issue) return undefined;
  return {
    issue: true,
    description: state.description.trim(),
    notes: state.notes.trim(),
    customer_name: state.customerName.trim(),
  };
}

/** Hebrew message for a missing required receipt field, or null when the options are complete. */
export function receiptValidationError(state: ReceiptOptionsState): string | null {
  if (!state.customerName.trim()) return "נא לכתוב את שם הלקוחה כפי שיופיע בקבלה, או לבטל את הסימון של הפקת קבלה.";
  if (!state.description.trim()) return "נא לכתוב עבור מה הקבלה, או לבטל את הסימון של הפקת קבלה.";
  return null;
}

/**
 * Default receipt name for the selected customer: her saved receipt name, else her app name
 * (fetched from the backend). For a new customer (no id yet) the typed name is used.
 */
export function useReceiptCustomerName(customerId: string | number | null | undefined, fallbackName: string): ReceiptCustomer {
  const id = customerId ? String(customerId) : "";
  const { data } = useSWR(id ? `/receipts/customer-name/${id}` : null, () => receiptsApi.customerName(Number(id)), {
    revalidateOnFocus: false,
  });
  const fetched = data?.success ? data.data?.name : undefined;
  return { key: id ? `c${id}` : "new", name: fetched ?? fallbackName ?? "" };
}

export function useReceiptsStatus() {
  const { data } = useSWR("/receipts/status", () => receiptsApi.status(), { revalidateOnFocus: false });
  const status = data?.success ? data.data : undefined;
  return { enabled: !!status?.enabled };
}

interface ReceiptOptionsProps {
  value: ReceiptOptionsState;
  onChange: (next: ReceiptOptionsState) => void;
  className?: string;
  /** Hide the checkbox (the edit page has an explicit "issue" button instead). */
  hideToggle?: boolean;
}

export function ReceiptOptions({ value, onChange, className, hideToggle }: ReceiptOptionsProps) {
  const showFields = hideToggle || value.issue;

  return (
    <div className={cn("rounded-2xl border-2 p-3 space-y-3", showFields ? "border-primary/30 bg-primary/5" : "bg-muted/10", className)}>
      {!hideToggle && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.issue}
            onChange={(e) => onChange({ ...value, issue: e.target.checked, issueTouched: true })}
            className="h-5 w-5 accent-primary"
          />
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">להפיק קבלה</span>
        </label>
      )}

      {showFields && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">שם הלקוחה בקבלה</label>
            <Input
              value={value.customerName}
              onChange={(e) => onChange({ ...value, customerName: e.target.value, customerNameTouched: true })}
              placeholder="השם המלא כפי שיופיע בקבלה"
              maxLength={255}
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">עבור</label>
            <Input
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value, descriptionTouched: true })}
              placeholder="עבור מה הקבלה?"
              maxLength={200}
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">הערה בקבלה (אופציונלי)</label>
            <textarea
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
              placeholder="תודפס על הקבלה"
              className="w-full h-16 p-2 text-sm rounded-xl border-2 bg-background focus:border-primary outline-none resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
