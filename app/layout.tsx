import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
    title: "LETUS 서류 통합 관리 플랫폼",
    description: "택배사업자 지위 유지를 위한 필수 서류 제출 포털",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <body className="bg-background min-h-screen flex flex-col font-sans text-foreground antialiased selection:bg-letus-orange/20 selection:text-letus-orange">
                {/* Header */}
                <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                    <div className="container flex h-16 items-center justify-between px-4 md:px-8 max-w-7xl mx-auto">
                        <Link href="/" className="flex items-center gap-2">
                            <span className="text-2xl font-bold tracking-tighter text-letus-black">LETUS</span>
                            <span className="hidden md:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-letus-orange/10 text-letus-orange">
                                서류 통합 관리
                            </span>
                        </Link>
                        <nav className="flex items-center gap-6 text-sm font-medium">
                            <Link href="/notice" className="hidden md:block transition-colors hover:text-letus-orange text-letus-charcoal">
                                공지사항
                            </Link>
                            <Link href="/guide" className="hidden md:block transition-colors hover:text-letus-orange text-letus-charcoal">
                                제출가이드
                            </Link>
                            <div className="flex items-center gap-2">
                                {/* Placeholder for User Profile or Login Status */}
                            </div>
                        </nav>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 flex flex-col">
                    {children}
                </main>

                {/* Footer */}
                <footer className="border-t bg-[#1A1A1A] text-white py-10 mt-auto">
                    <div className="container px-4 md:px-8 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-8">
                        <div>
                            <p className="text-lg font-bold text-white mb-2">레터스(LETUS)｜가구 전문 서비스&물류 기업</p>
                            <div className="text-sm text-gray-400 space-y-1">
                                <p>양지센터 (본사) · 경기도 용인시 처인구 · 양지면 남평로 111-73 10층</p>
                                <p className="text-xs pt-2 text-gray-500">Copyright © LETUS Corp. All rights reserved.</p>
                            </div>
                        </div>
                        <div className="flex gap-6 text-sm text-gray-400">
                            <a href="#" className="hover:text-letus-orange transition-colors">개인정보처리방침</a>
                            <a href="#" className="hover:text-letus-orange transition-colors">이용약관</a>
                        </div>
                    </div>
                </footer>
            </body>
        </html>
    );
}
