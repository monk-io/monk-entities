import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkOS AuthKit - MonkEC Example",
  description: "Next.js app with WorkOS AuthKit authentication managed by MonkEC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
