import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clerk Auth - MonkEC Example",
  description: "Next.js app with Clerk authentication managed by MonkEC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider dynamic>
      <html lang="en">
        <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
