// This component must be the top-most import in this file!
import { ReactScan } from "@/ReactScanComponent";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopMenu } from "@/components/TopMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "3D face tracking with RPM avatar",
  description: "3D face tracking with Ready Player Me avatar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <ReactScan />
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <TopMenu />
        {children}
      </body>
    </html>
  );
}
