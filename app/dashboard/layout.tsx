export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <nav className="border-b bg-white px-4 py-3 flex justify-between items-center">
                <div className="font-bold text-lg text-slate-800">LETUS 서류 관리</div>
                <div className="text-sm text-slate-500">로그아웃</div>
            </nav>
            <main className="p-4 md:p-8 max-w-5xl mx-auto">
                {children}
            </main>
        </div>
    )
}
