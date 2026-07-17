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

export const metadata = {
  title: "FORCE PULSE — Tournament Scorer",
  description: "Live scoring and tournament standings tracker.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0d472c",
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
