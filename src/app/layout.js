import { Anton, Work_Sans, Roboto_Mono } from "next/font/google";
import "./globals.css";
import CapacitorInit from "@/components/CapacitorInit";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://forcepulse.vercel.app";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "FORCE PULSE — Tournament Scorer",
  description: "Live scoring and tournament standings tracker.",
  applicationName: "FORCE PULSE",
  icons: {
    icon: [{ url: "/force-pulse-logo.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
    shortcut: ["/force-pulse-logo.png"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "FORCE PULSE",
    title: "FORCE PULSE — Tournament Scorer",
    description: "Live scoring and tournament standings tracker.",
    images: [
      {
        url: "/og-logo.png",
        width: 1200,
        height: 1200,
        alt: "FORCE PULSE",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FORCE PULSE — Tournament Scorer",
    description: "Live scoring and tournament standings tracker.",
    images: ["/og-logo.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0d472c",
  viewportFit: "cover",
  // Android / Capacitor: shrink layout when soft keyboard opens
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${workSans.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream-bg text-deep-forest font-sans overflow-x-hidden">
        <CapacitorInit />
        {children}
      </body>
    </html>
  );
}
