"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 시공팀 등록은 통합 대시보드로 이관됨
// 기존 URL 접속 시 메인 페이지로 리다이렉트
export default function ConstructionRegistrationRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/");
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center space-y-3">
                <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-500">
                    시공팀 등록이 통합 포털로 이관되었습니다.
                    <br />메인 페이지로 이동합니다...
                </p>
            </div>
        </div>
    );
}
