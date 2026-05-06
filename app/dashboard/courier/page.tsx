"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Truck,
    LogOut,
    Check,
    FileText,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COURIER_CHECKLIST_TEMPLATE } from "../../data/mock";
import { getUserDocuments, FirestoreDocument } from "@/lib/firestore";

function CourierDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const userId = searchParams.get("userId");
    const name = searchParams.get("name") || "기사";
    const region = searchParams.get("region") || "센터";

    const [documents, setDocuments] = useState<FirestoreDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (!userId) { setIsLoading(false); return; }
            try {
                const docs = await getUserDocuments(userId);
                setDocuments(docs);
            } catch (error) {
                console.error("데이터 로드 실패:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [userId]);

    const checklist = COURIER_CHECKLIST_TEMPLATE.map(item => {
        const doc = documents.find(d => d.itemId === item.id);
        const isCompleted = doc && (doc.status === "submitted" || doc.status === "approved");
        return {
            ...item,
            status: isCompleted ? "completed" : "pending",
        };
    });

    const progress = Math.round((checklist.filter(i => i.status === "completed").length / checklist.length) * 100);

    const handleDocClick = (itemId: string, title: string) => {
        const query = new URLSearchParams(searchParams.toString());
        query.set("itemId", itemId);
        query.set("docTitle", title);
        router.push(`/upload/${itemId}?${query.toString()}`);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Gradient Header — 원본 디자인 */}
            <div className="bg-gradient-to-br from-letus-charcoal to-letus-black text-white p-6 pb-12 rounded-b-[2rem] shadow-xl">
                <div className="flex justify-between items-start text-white">
                    <div>
                        <div className="flex items-center gap-2 text-letus-orange mb-1 font-bold text-sm">
                            <Truck className="h-4 w-4" /> {region}
                        </div>
                        <h1 className="text-2xl font-bold">{name} 기사님</h1>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Button
                            variant="ghost"
                            className="text-white hover:bg-white/10 h-10 px-4"
                            onClick={() => router.push("/")}
                        >
                            <LogOut className="h-4 w-4 mr-2" /> 나가기
                        </Button>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-letus-orange">{progress}%</div>
                            <div className="text-xs text-slate-400">제출 완료</div>
                        </div>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="mt-6">
                    <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                            className="bg-letus-orange h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Content — single card, list style */}
            <div className="container mx-auto px-4 -mt-6 space-y-4 max-w-lg">
                <Card className="shadow-lg border-0 bg-white">
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="text-lg">필수 제출 서류 ({checklist.length}개)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 divide-y">
                        {checklist.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleDocClick(item.id, item.title)}
                                className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${item.status === "completed" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                                        }`}>
                                        {item.status === "completed"
                                            ? <Check className="h-5 w-5" />
                                            : <FileText className="h-5 w-5" />
                                        }
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">{item.title}</div>
                                        <div className="text-xs text-slate-500">{item.required ? "필수" : "선택"}</div>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function CourierDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <CourierDashboardContent />
        </Suspense>
    );
}
