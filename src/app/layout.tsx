"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import React from "react";
import { SyncProvider } from "../providers/Sync";
import { GridProvider } from "../providers/Grids";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SyncProvider>
          <GridProvider>{children}</GridProvider>
        </SyncProvider>
      </body>
    </html>
  );
}
