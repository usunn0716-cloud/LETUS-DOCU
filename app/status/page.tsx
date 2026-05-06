"use client"

import { useState } from "react"
import { BarChart, Search, Filter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { REGIONAL_STATUS, SUBMISSION_LIST } from "@/lib/mock-data"

// Phone masking utility
const maskPhone = (phone: string) => {
    return phone.replace(/(\d{3})-\d{4}-(\d{4})/, "$1-****-$2")
}

export default function StatusDashboard() {
    const [searchTerm, setSearchTerm] = useState("")

    const filteredList = SUBMISSION_LIST.filter((item) =>
        item.name.includes(searchTerm) || item.region.includes(searchTerm)
    )

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tighter text-slate-900">
                            실시간 서류 수집 현황
                        </h1>
                        <p className="text-slate-500">
                            권역별 제출률 및 개별 제출 현황을 모니터링합니다.
                        </p>
                    </div>
                    <Button variant="outline" className="gap-2">
                        <Filter className="h-4 w-4" />
                        필터 설정
                    </Button>
                </div>

                {/* Regional Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {REGIONAL_STATUS.map((stat, index) => (
                        <Card key={index} className="overflow-hidden">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex justify-between">
                                    {stat.region}
                                    <span className={`text-sm font-bold ${stat.rate >= 80 ? "text-green-600" :
                                            stat.rate >= 50 ? "text-blue-600" : "text-red-500"
                                        }`}>
                                        {stat.rate}%
                                    </span>
                                </CardTitle>
                                <CardDescription>{stat.subRegion}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${stat.rate >= 80 ? "bg-green-500" :
                                                stat.rate >= 50 ? "bg-blue-500" : "bg-red-500"
                                            }`}
                                        style={{ width: `${stat.rate}%` }}
                                    />
                                </div>
                                <div className="mt-2 text-xs text-right text-slate-400">
                                    {stat.submitted} / {stat.total} 명 제출 완료
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Submission List Table */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div>
                                <CardTitle>제출자 목록</CardTitle>
                                <CardDescription>
                                    개인정보 보호를 위해 전화번호 일부가 마스킹 처리됩니다.
                                </CardDescription>
                            </div>
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="이름 또는 권역 검색..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <div className="grid grid-cols-6 gap-4 p-4 bg-slate-100 font-medium text-sm text-slate-500 text-center">
                                <div className="col-span-1">이름</div>
                                <div className="col-span-2 md:col-span-1">전화번호</div>
                                <div className="col-span-2 hidden md:block">권역</div>
                                <div className="col-span-1 hidden md:block">역할</div>
                                <div className="col-span-1">상태</div>
                                <div className="col-span-2 md:col-span-1 hidden md:block">제출일</div>
                            </div>
                            <div className="divide-y">
                                {filteredList.map((item) => (
                                    <div key={item.id} className="grid grid-cols-6 gap-4 p-4 text-sm items-center text-center hover:bg-slate-50">
                                        <div className="col-span-1 font-medium">{item.name}</div>
                                        <div className="col-span-2 md:col-span-1 font-mono text-slate-600">
                                            {maskPhone(item.phone)}
                                        </div>
                                        <div className="col-span-2 hidden md:block text-slate-600">{item.region}</div>
                                        <div className="col-span-1 hidden md:block">
                                            <span className={`px-2 py-1 rounded-full text-xs ${item.role === '영업소장' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {item.role}
                                            </span>
                                        </div>
                                        <div className="col-span-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.status === '완료' ? 'bg-green-100 text-green-700' :
                                                    item.status === '반려' ? 'bg-red-100 text-red-700' :
                                                        'bg-slate-100 text-slate-700'
                                                }`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="col-span-2 md:col-span-1 hidden md:block text-slate-400 text-xs">
                                            {item.date}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
