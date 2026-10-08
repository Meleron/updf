import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Geist } from "next/font/google";
import { connection } from "next/server";
import { BackendUrlProvider } from "@/components/backend-url";
import { OpenDocumentProvider } from "@/components/open-document";
import "./globals.css";
// The faces of text boxes, the same files the backend draws with.
import "./fonts.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("App");
  return { title: t("name"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request and read the backend URL then, not at build time, so one image works in every environment.
  await connection();
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL is not set.");
  }

  return (
    <html lang={await getLocale()} className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NextIntlClientProvider>
            <BackendUrlProvider url={backendUrl}>
              <OpenDocumentProvider>{children}</OpenDocumentProvider>
            </BackendUrlProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
