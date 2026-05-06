"use client";

import { ChevronRight, Bell, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MOCK_NOTICES = [
    {
        id: 1,
        title: "[공지] 2024년 상반기 택배사업자 정기 점검 안내",
        date: "2024-02-24",
        isNew: true
    },
    {
        id: 2,
        title: "개인정보처리방침 개정 안내 (시행일: 2024년 3월 1일)",
        date: "2024-02-20",
        isNew: false
    },
    {
        id: 3,
        title: "서류 통합 관리 플랫폼 서버 점검 안내",
        date: "2024-02-15",
        isNew: false
    }
];

export default function NoticePage() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b py-10 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-4">
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">공지사항</h1>
                    <p className="text-lg text-slate-500">
                        LETUS 서비스의 중요 소식을 전해드립니다.
                    </p>
                </div>
            </header>

            <main className="flex-1 max-w-4xl w-full mx-auto p-6">
                <div className="space-y-4">
                    {MOCK_NOTICES.map((notice) => (
                        <Card key={notice.id} className="hover:border-letus-orange transition-all cursor-pointer shadow-sm">
                            <CardContent className="p-5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${notice.isNew ? 'bg-letus-orange/10 text-letus-orange' : 'bg-slate-100 text-slate-400'}`}>
                                        <Bell className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-900">{notice.title}</h3>
                                            {notice.isNew && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>}
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                            <Calendar className="h-3 w-3" /> {notice.date}
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-300" />
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="flex justify-center pt-10">
                    <Button variant="outline" className="border-slate-200 text-slate-500 px-10">
                        목록 더 보기
                    </Button>
                </div>
            </main>
        </div>
    );
}
