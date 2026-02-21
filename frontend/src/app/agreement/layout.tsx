import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "חתימה דיגיטלית על הסכם",
  description: "חתימה דיגיטלית על הסכם",
};

export default function AgreementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
