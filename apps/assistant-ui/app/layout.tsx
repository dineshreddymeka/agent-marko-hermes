import type { Metadata } from "next";
import { MyRuntimeProvider } from "@/app/MyRuntimeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "assistant-ui + Hermes",
  description:
    "Open-source assistant-ui chat frontend connected to Hermes Agent via AG-UI",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-dvh">
      <body className="h-dvh font-sans">
        <TooltipProvider>
          <MyRuntimeProvider>{children}</MyRuntimeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
