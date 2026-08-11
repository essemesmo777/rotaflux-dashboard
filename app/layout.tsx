import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "OperBase — Gestão Operacional",
    description: "Custos, diesel e lucro sob controle.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Rotas que dão resultado.",
      description: "Custos, diesel e lucro sob controle.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "OperBase — Operações que dão resultado" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Rotas que dão resultado.",
      description: "Custos, diesel e lucro sob controle.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
