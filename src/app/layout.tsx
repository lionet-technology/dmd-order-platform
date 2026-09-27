import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "DMD Finance Ops", description: "PoC for linked order, cost, balance and reconciliation intake." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
