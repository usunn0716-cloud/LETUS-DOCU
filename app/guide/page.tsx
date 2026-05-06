"use client";

import { useState } from "react";
import { ChevronRight, FileText, Search, Calendar, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Post {
    id: number;
    title: string;
    excerpt: string;
    date: string;
    author: string;
    category: string;
}

const MOCK_POSTS: Post[] = [
    {
        id: 1,
        title: "2025년도 택배기사 필수 서류 제출 가이드 (최신판)",
        excerpt: "신규 계약 및 갱신 시 필요한 모든 서류의 종류와 주의사항을 상세히 안내해 드립니다. 특히 AI 점검 기준을 확인하여 반려를 예방하세요.",
        date: "2024-02-24",
        author: "LETUS 운영팀",
        category: "필독"
    },
    {
        id: 2,
        title: "사업자등록증 업태/종목 수정 및 제출 방법",
        excerpt: "화물운송업 지위 유지를 위해 필수적으로 기재되어야 하는 업태와 종목 정보를 확인하고, 국세청 홈택스에서 수정하는 방법을 알려드립니다.",
        date: "2024-02-20",
        author: "LETUS 법무팀",
        category: "팁"
    },
    {
        id: 3,
        title: "위수탁계약서 및 부속합의서 작성 시 자주 하는 실수",
        excerpt: "서명 누락, 체크박스 미체크 등 AI 점검에서 자주 발생하는 반려 사유들을 정리했습니다. 제출 전 이 체크리스트를 꼭 확인하세요.",
        date: "2024-02-15",
        author: "LETUS 운영팀",
        category: "가이드"
    },
    {
        id: 4,
        title: "화물운송종사 자격증 및 운전면허증 스캔 팁",
        excerpt: "빛 반사나 흐림 현상 없이 깨끗하게 서류를 촬영하는 법을 안내합니다. OCR 인식률을 높여 승인 속도를 단축해보세요.",
        date: "2024-02-10",
        author: "LETUS 기술팀",
        category: "팁"
    }
];

export default function GuidePage() {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredPosts = MOCK_POSTS.filter(post =>
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b py-10 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-4">
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">제출가이드</h1>
                    <p className="text-lg text-slate-500">
                        LETUS 서류 제출에 필요한 모든 정보와 가이드를 한곳에서 확인하세요.
                    </p>
                    <div className="max-w-xl mx-auto relative mt-8">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="가이드 검색..."
                            className="pl-10 h-12 bg-white shadow-sm border-slate-200 rounded-full"
                        />
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-slate-800">최신 가이드</h2>
                    <div className="flex gap-2">
                        {["전체", "필독", "가이드", "팁"].map((cat) => (
                            <Button key={cat} variant="ghost" size="sm" className="text-xs font-medium text-slate-500 hover:text-letus-orange">
                                {cat}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4">
                    {filteredPosts.map((post) => (
                        <Card key={post.id} className="group hover:border-letus-orange transition-all cursor-pointer overflow-hidden shadow-sm hover:shadow-md">
                            <CardContent className="p-0">
                                <div className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-2 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${post.category === '필독' ? 'bg-red-100 text-red-600' :
                                                        post.category === '팁' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    {post.category}
                                                </span>
                                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" /> {post.date}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-900 group-hover:text-letus-orange transition-colors">
                                                {post.title}
                                            </h3>
                                            <p className="text-sm text-slate-500 line-clamp-2">
                                                {post.excerpt}
                                            </p>
                                            <div className="flex items-center gap-3 pt-3">
                                                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                    <User className="h-3 w-3" /> {post.author}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="hidden sm:flex self-center">
                                            <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-letus-orange/10 group-hover:text-letus-orange transition-all">
                                                <ChevronRight className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {filteredPosts.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200">
                            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">검색 결과가 없습니다.</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-center pt-10">
                    <Button variant="outline" className="border-slate-200 text-slate-500 px-10">
                        더 보기
                    </Button>
                </div>
            </main>
        </div>
    );
}
