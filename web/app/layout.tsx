import type { Metadata } from "next";
import "./globals.css";

/*
 * 서체는 next/font/google (Geist) 대신 public/fonts 자체 호스팅으로 바꿨다.
 * 사내망에서는 Google Fonts 로 나가지 못하고, flow 와 같은 Pretendard /
 * JetBrains Mono 를 써야 두 앱의 디자인 결이 맞는다. @font-face 선언은
 * app/globals.css 맨 위에 있다.
 */

export const metadata: Metadata = {
  title: "Sonar Alpha | Semiconductor Intelligence Workbench",
  description:
    "S3 기반 반도체 데이터 온보딩, TEG 구조 지식, wafer-map 분석과 GPT-OSS RCA를 위한 독립형 워크벤치.",
  openGraph: {
    title: "Sonar Alpha | Semiconductor Intelligence Workbench",
    description: "Structure-aware yield intelligence from S3 data to surrogate simulation.",
    type: "website",
    images: [
      {
        url: "/sonar-og.png",
        width: 1200,
        height: 630,
        alt: "Sonar wafer intelligence overview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sonar Alpha",
    description: "Structure-aware yield intelligence",
    images: ["/sonar-og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
