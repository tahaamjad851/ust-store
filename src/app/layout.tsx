import type { Metadata } from "next";
// next/font downloads these at build time and serves them from our own origin (font-src 'self').
import { Inter, Work_Sans } from "next/font/google";
import { getStoreSettings } from "@/services/catalog";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  return {
    title: { default: settings.business_name, template: `%s | ${settings.business_name}` },
    description: `${settings.tagline}. ${settings.value_statement}.`,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${workSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
