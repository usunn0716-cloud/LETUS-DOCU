"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Home,
    FileText,
    BarChart3,
    ChevronDown,
    Pencil,
    Check,
    X,
    Trash2,
    RotateCcw,
    Calendar,
    Eye,
    Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REGIONAL_DATA } from "../../data/mock";
import { getAllDocuments, cancelDocument, reviewDocument, reviewDocumentByHQ, FirestoreDocument } from "@/lib/firestore";
import { deleteDocumentFile } from "@/lib/storage";
import { downloadDocumentsAsZip } from "@/lib/downloadZip";

// --- Section Configuration for Admin Dashboard ---
const SECTION_CONFIG = [
    {
        id: "s1", title: "양지센터/안성센터 B2C", color: "#FF6F43",
        offices: [
            "양지6영업소((주)디에스엔지니어)", "양지7영업소((주)서현테크)", "양지8영업소(스타일룸)",
            "양지12영업소(TY서비스)", "양지2_2영업소(엠케이프로젝트퍼니처)", "양지23영업소(일룸)",
            "양지13영업소", "양지9영업소(그랑팩토리)", "안성1영업소(유빈산업)",
            "양지22영업소(에이와이가구)", "양지2_1영업소(요다프렌즈)"
        ]
    },
    {
        id: "s2", title: "양지센터 B2B", color: "#3B82F6",
        offices: [
            "양지14영업소(LHS)", "양지15영업소(CMS 프로모션)", "양지16영업소(오성)",
            "양지17영업소(온찬유통)", "양지18영업소(모든퍼니처)", "양지19영업소(드래곤)",
            "양지20영업소(정인유통)"
        ]
    },
    {
        id: "s3", title: "지방센터", color: "#10B981",
        offices: [
            "부산1영업소(태인유통)", "부산(기장)2영업소(태준유통)", "전남1영업소(스마일유통)",
            "창원1영업소(정빈유통)", "울산1영업소(수연유통)", "제주1영업소(스마일유통)"
        ]
    },
    {
        id: "s4", title: "대구센터 영업소", color: "#8B5CF6",
        offices: [
            "대구1영업소(투윈스)", "대구2영업소(대구가구)", "대구3영업소(형제유통)", "대구4영업소(석퍼시스)"
        ]
    },
    {
        id: "s5", title: "대전센터 영업소", color: "#F59E0B",
        offices: [
            "대전1영업소(주식회사오제이더블유)", "대전2영업소(주식회사에스엔티)",
            "대전3영업소(주식회사티오피플랜)", "대전4영업소(무빙인)", "대전5영업소(비비디)"
        ]
    },
    {
        id: "s6", title: "광주센터 영업소", color: "#EC4899",
        offices: [
            "광주1영업소(주식회사와이에스유통)", "광주2영업소(FIT퍼니처)", "전북1영업소(대영)"
        ]
    }
];

// 영업소명 → 센터 색상 매핑 (랭킹보드용)
const OFFICE_COLOR_MAP: Record<string, string> = {};
SECTION_CONFIG.forEach(s => s.offices.forEach(o => { OFFICE_COLOR_MAP[o] = s.color; }));

interface OfficeData {
    subRegion: string;
    managerName: string;
    stats: { total: number; submitted: number; rate: number };
    docsRequired: number;
    notes: string;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [submissions, setSubmissions] = useState<FirestoreDocument[]>([]);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ "s1": true });
    const [editingOffice, setEditingOffice] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ total: string; docsRequired: string; notes: string }>({ total: "0", docsRequired: "0", notes: "" });
    const [isLoading, setIsLoading] = useState(true);

    // 테이블 필터 상태
    const [selectedDate, setSelectedDate] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterOffice, setFilterOffice] = useState("");
    const [filterTitle, setFilterTitle] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    const [rankSortAsc, setRankSortAsc] = useState(false);
    const [rankExpanded, setRankExpanded] = useState(true);
    const [previewDocId, setPreviewDocId] = useState<string | null>(null);

    // 수동 심사 상태
    const [reviewModalDoc, setReviewModalDoc] = useState<FirestoreDocument | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [reviewProcessing, setReviewProcessing] = useState(false);

    // 본사 2차 심사 상태
    const [hqReviewModalDoc, setHqReviewModalDoc] = useState<FirestoreDocument | null>(null);
    const [hqRejectReason, setHqRejectReason] = useState("");
    const [hqReviewProcessing, setHqReviewProcessing] = useState(false);

    // 영업소별 총원/서류총합/비고 오버라이드 (관리자 편집 → localStorage 저장)
    const [sectionOverrides, setSectionOverrides] = useState<Record<string, { total: number; docsRequired: number; notes: string }>>(() => {
        if (typeof window === "undefined") return {};
        const saved = localStorage.getItem("letus_admin_overrides_v3");
        return saved ? JSON.parse(saved) : {};
    });

    // Load all submissions from Firestore
    const fetchData = async () => {
        try {
            const docs = await getAllDocuments();
            setSubmissions(docs);
        } catch (error) {
            console.error("데이터 로드 실패:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // 사용자별 서류 일괄 ZIP 다운로드
    const [downloadingUserId, setDownloadingUserId] = useState<string | null>(null);
    const handleDownloadUserDocs = async (targetUserId: string, targetUserName: string) => {
        setDownloadingUserId(targetUserId);
        try {
            const userDocs = submissions.filter(s =>
                s.userId === targetUserId && s.fileUrl &&
                (s.status === "submitted" || s.status === "approved" || s.status === "hq_review" || (s.status === "pending" && s.fileUrl))
            );
            if (userDocs.length === 0) {
                alert("다운로드할 서류가 없습니다.");
                return;
            }
            await downloadDocumentsAsZip(userDocs, `${targetUserName}_전체서류`);
        } catch (error) {
            console.error("다운로드 실패:", error);
            alert("다운로드 중 오류가 발생했습니다.");
        } finally {
            setDownloadingUserId(null);
        }
    };

    // 본사 2차 심사 처리
    const handleHQReviewAction = async (docId: string, action: "approved" | "rejected") => {
        setHqReviewProcessing(true);
        try {
            await reviewDocumentByHQ(docId, action, action === "rejected" ? hqRejectReason || "서류 부적합" : undefined);
            setSubmissions(prev => prev.map(s =>
                s.id === docId ? { ...s, status: action } : s
            ));
            setHqReviewModalDoc(null);
            setHqRejectReason("");
            alert(action === "approved" ? "✅ 최종 승인되었습니다." : "❌ 최종 반려 처리되었습니다.");
        } catch (error) {
            console.error("본사 심사 처리 실패:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setHqReviewProcessing(false);
        }
    };

    useEffect(() => {
        fetchData();
        // 15초마다 자동 새로고침 (실시간 업로드 반영)
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, []);

    const toggleSection = (id: string) => {
        setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // ✅ 영업소별 실제 제출 건수 계산 (Firestore/제출 상태 기반)
    // .trim() 적용으로 공백 차이 방지
    const getSubmittedCount = (subRegion: string): number => {
        const target = subRegion.trim();
        return submissions.filter(
            s => s.userSubRegion?.trim() === target &&
                (s.status === "submitted" || s.status === "approved")
        ).length;
    };

    const getOfficeData = (subRegion: string): OfficeData => {
        const base = REGIONAL_DATA.find(d => d.subRegion === subRegion);
        const override = sectionOverrides[subRegion];

        const total = override?.total ?? base?.stats?.total ?? 0;
        const docsRequired = override?.docsRequired ?? total * 8;
        const submitted = getSubmittedCount(subRegion);
        const rate = docsRequired > 0 ? Math.round((submitted / docsRequired) * 100) : 0;
        const notes = override?.notes ?? "";
        const managerName = base?.managerName ?? "-";

        return { subRegion, managerName, stats: { total, submitted, rate }, docsRequired, notes };
    };

    const startEdit = (subRegion: string) => {
        const d = getOfficeData(subRegion);
        setEditingOffice(subRegion);
        setEditValues({ total: String(d.stats.total), docsRequired: String(d.docsRequired), notes: d.notes || "" });
    };

    const saveEdit = (subRegion: string) => {
        const newOverrides = {
            ...sectionOverrides,
            [subRegion]: {
                total: parseInt(editValues.total) || 0,
                docsRequired: parseInt(editValues.docsRequired) || 0,
                notes: editValues.notes || ""
            }
        };
        setSectionOverrides(newOverrides);
        localStorage.setItem("letus_admin_overrides_v3", JSON.stringify(newOverrides));
        setEditingOffice(null);
    };

    const cancelEdit = () => { setEditingOffice(null); };

    // 필터링된 제출 목록 (submitted, approved, rejected, hq_review, 그리고 파일 있는 pending 모두 표시)
    const filteredSubmissions = useMemo(() => {
        let result = submissions
            .filter(s =>
                s.status === "submitted" ||
                s.status === "approved" ||
                s.status === "rejected" ||
                s.status === "hq_review" ||
                (s.status === "pending" && s.fileUrl)  // 파일 있는 pending = 수동심사 대기
            )
            .sort((a, b) => {
                const timeA = a.submittedAt?.toDate?.() || new Date(0);
                const timeB = b.submittedAt?.toDate?.() || new Date(0);
                return timeB.getTime() - timeA.getTime();
            });

        if (selectedDate) {
            result = result.filter(s => {
                const time = s.submittedAt?.toDate?.();
                if (!time) return false;
                const d = new Date(time);
                // 브라우저 로컬 시간대 기준으로 "YYYY-MM-DD" 생성
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}` === selectedDate;
            });
        }

        if (filterName.trim()) {
            result = result.filter(s => s.userName?.toLowerCase().includes(filterName.trim().toLowerCase()));
        }
        if (filterOffice.trim()) {
            result = result.filter(s => s.userSubRegion?.toLowerCase().includes(filterOffice.trim().toLowerCase()));
        }
        if (filterTitle.trim()) {
            result = result.filter(s => s.title?.toLowerCase().includes(filterTitle.trim().toLowerCase()));
        }
        if (filterStatus !== "all") {
            if (filterStatus === "pending") {
                result = result.filter(s => s.status === "pending" || s.status === "hq_review");
            } else {
                result = result.filter(s => s.status === filterStatus);
            }
        }

        return result;
    }, [submissions, selectedDate, filterName, filterOffice, filterTitle, filterStatus]);

    // 필터 변경 시 첫 페이지로 리셋
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedDate, filterName, filterOffice, filterTitle, filterStatus]);

    // 페이지네이션 적용된 제출 목록
    const paginatedSubmissions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredSubmissions.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredSubmissions, currentPage]);

    const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);

    // --- 관리 기능 ---
    const handleDeleteSubmission = async (docId: string) => {
        if (!confirm("이 제출 내역을 삭제(취소 처리)하시겠습니까?\n파일이 스토리지에서도 영구 삭제됩니다.")) return;
        try {
            // 삭제 전 해당 서류 정보 가져오기 (Storage URL 추출용)
            const target = submissions.find(s => s.id === docId);

            // Firestore 초기화 (데이터 전체 비우기)
            await cancelDocument(docId);

            // Firebase Storage 파일 삭제
            if (target) {
                const urlsToDelete = [
                    target.fileUrl,
                    (target as any).fileUrl2,
                    ...((target as any).fileUrls || [])
                ].filter(Boolean) as string[];
                await Promise.allSettled(urlsToDelete.map(url => deleteDocumentFile(url)));
            }

            // 로컬 상태에서 완전히 제거 (목록에서 사라짐)
            setSubmissions(prev => prev.filter(s => s.id !== docId));
        } catch (error) {
            console.error("삭제 실패:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    const handleResetAll = async () => {
        if (!confirm("⚠️ 모든 제출 내역을 초기화(취소)하시겠습니까?\n파일이 스토리지에서도 영구 삭제되며, 이 작업은 되돌릴 수 없습니다.")) return;
        try {
            // submitted, approved, rejected, 그리고 파일 있는 pending 모두 초기화
            const toCancel = submissions.filter(s =>
                s.status === "submitted" || s.status === "approved" || s.status === "rejected" ||
                s.status === "hq_review" || (s.status === "pending" && s.fileUrl)
            );
            for (const s of toCancel) {
                if (!s.id) continue;
                await cancelDocument(s.id);
                const urlsToDelete = [
                    s.fileUrl,
                    (s as any).fileUrl2,
                    ...((s as any).fileUrls || [])
                ].filter(Boolean) as string[];
                await Promise.allSettled(urlsToDelete.map(url => deleteDocumentFile(url)));
            }
            // 초기화된 항목들의 fileUrl을 null로 반영 (자동새로고침 전 즉시 반영)
            const cancelledIds = new Set(toCancel.map(s => s.id));
            setSubmissions(prev => prev.map(s =>
                cancelledIds.has(s.id) ? { ...s, status: "pending" as const, fileUrl: undefined } : s
            ));
            alert("전체 초기화가 완료되었습니다.");
        } catch (error) {
            console.error("초기화 실패:", error);
            alert("초기화 중 오류가 발생했습니다.");
        }
    };

    // 수동 심사 대기열 (AI 모호 판정 → pending + 파일 있음)
    const pendingDocs = useMemo(() => {
        return submissions
            .filter(s => s.status === "pending" && s.fileUrl)
            .sort((a, b) => {
                const timeA = a.submittedAt?.toDate?.() || new Date(0);
                const timeB = b.submittedAt?.toDate?.() || new Date(0);
                return timeB.getTime() - timeA.getTime();
            });
    }, [submissions]);

    // 본사 2차 심사 대기열 (영업소장이 반려 → hq_review)
    const hqReviewDocs = useMemo(() => {
        return submissions
            .filter(s => s.status === "hq_review")
            .sort((a, b) => {
                const timeA = a.submittedAt?.toDate?.() || new Date(0);
                const timeB = b.submittedAt?.toDate?.() || new Date(0);
                return timeB.getTime() - timeA.getTime();
            });
    }, [submissions]);

    const handleReviewAction = async (docId: string, action: "approved" | "rejected") => {
        setReviewProcessing(true);
        try {
            await reviewDocument(docId, action, "admin", action === "rejected" ? rejectReason || "서류 부적합" : undefined);
            setSubmissions(prev => prev.map(s =>
                s.id === docId ? { ...s, status: action } : s
            ));
            setReviewModalDoc(null);
            setRejectReason("");
            alert(action === "approved" ? "✅ 승인되었습니다." : "❌ 반려 처리되었습니다.");
        } catch (error) {
            console.error("심사 처리 실패:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setReviewProcessing(false);
        }
    };

    // Aggregate stats (편집된 값 기반)
    const allOffices = SECTION_CONFIG.flatMap(s => s.offices);
    const allOfficeData = allOffices.map(o => getOfficeData(o));
    const totalPeople = allOfficeData.reduce((sum, d) => sum + d.stats.total, 0);
    const totalDocsRequired = allOfficeData.reduce((sum, d) => sum + d.docsRequired, 0);
    const totalAllSubmitted = allOfficeData.reduce((sum, d) => sum + d.stats.submitted, 0);
    const overallRate = totalDocsRequired > 0 ? Math.round((totalAllSubmitted / totalDocsRequired) * 100) : 0;

    // 랭킹 데이터
    const rankedOffices = allOfficeData.map(d => ({
        ...d,
        docRate: d.docsRequired > 0 ? Math.round((d.stats.submitted / d.docsRequired) * 100) : 0
    })).sort((a, b) => rankSortAsc ? a.docRate - b.docRate : b.docRate - a.docRate);

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
        <div className="min-h-screen bg-slate-50">
            {/* Black Header — 원본 디자인 */}
            <div className="bg-letus-black text-white p-6 pb-8">
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold">관리자 대시보드</h1>
                            <p className="text-slate-400 text-sm mt-1">영업소별 서류 제출 현황 관리</p>
                        </div>
                        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => router.push("/")}>
                            <Home className="h-4 w-4 mr-2" /> 초기화면
                        </Button>
                    </div>
                    {/* Summary Stats — 5 columns */}
                    <div className="grid grid-cols-5 gap-3">
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-letus-orange">{overallRate}%</div>
                            <div className="text-xs text-slate-400 mt-1">전체 취합률</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold">{totalPeople}<span className="text-sm font-normal text-slate-400 ml-1">명</span></div>
                            <div className="text-xs text-slate-400 mt-1">전체 대상자(총원)</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold">{totalDocsRequired}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
                            <div className="text-xs text-slate-400 mt-1">서류총합(총원×8)</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-green-400">{totalAllSubmitted}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
                            <div className="text-xs text-slate-400 mt-1">제출 완료</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-red-400">{totalDocsRequired - totalAllSubmitted}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
                            <div className="text-xs text-slate-400 mt-1">미제출</div>
                        </div>
                    </div>
                    {/* 취합률 공식 안내 */}
                    <p className="text-[11px] text-slate-500 mt-3">※ 취합률 = (제출 서류 건수 ÷ 서류총합) × 100 | 서류총합 = 영업소별 편집 가능(기본값: 총원×8)</p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 -mt-4 pb-12 space-y-4">

                {/* ========== 본사 2차 심사 대기열 (영업소장 AI반려 직행 + 권역장/영업소장 이관 건) ========== */}
                <Card className="shadow-lg border-0 border-l-4 border-l-purple-400">
                    <CardHeader className="pb-3 border-b bg-purple-50/50">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Eye className="h-5 w-5 text-purple-500" />
                            본사 2차 심사 대기열
                            <span className="bg-purple-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                                {hqReviewDocs.length}건
                            </span>
                            <span className="text-xs font-normal text-slate-400 ml-1">영업소장 AI반려 직행 + 권역장/영업소장 이관 건</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 pl-6 font-medium text-slate-500">성명</th>
                                    <th className="p-3 font-medium text-slate-500">영업소</th>
                                    <th className="p-3 font-medium text-slate-500">서류명</th>
                                    <th className="p-3 font-medium text-slate-500">사유</th>
                                    <th className="p-3 text-center font-medium text-slate-500">서류 보기</th>
                                    <th className="p-3 pr-6 text-center font-medium text-slate-500">심사</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {hqReviewDocs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400 font-medium bg-white">
                                            대기 중인 본사 2차 심사 서류가 없습니다. (영업소장 AI반려 직행 / 권역장·영업소장 이관 건)
                                        </td>
                                    </tr>
                                ) : (
                                    hqReviewDocs.map((doc, i) => (
                                        <tr key={doc.id || i} className="bg-white hover:bg-purple-50/30">
                                            <td className="p-3 pl-6 font-bold">
                                                {doc.userName}
                                                <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${doc.userRole === "manager" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                                                    {doc.userRole === "manager" ? "영업소장" : "기사"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-slate-600 text-xs">{doc.userSubRegion}</td>
                                            <td className="p-3 text-purple-600 font-medium">{doc.title}</td>
                                            <td className="p-3 text-xs text-red-500">
                                                {(doc as any).managerRejectionReason
                                                    ? `영업소장 반려: ${(doc as any).managerRejectionReason}`
                                                    : (doc.verificationResult?.rejection_reasons?.[0]
                                                        ? `AI 판독: ${doc.verificationResult.rejection_reasons[0]}`
                                                        : "AI 판독 부적격")}
                                            </td>
                                            <td className="p-3 text-center">
                                                {doc.fileUrl && (
                                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                                        className="p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors inline-flex"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </a>
                                                )}
                                            </td>
                                            <td className="p-3 pr-6 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => handleHQReviewAction(doc.id!, "approved")}
                                                        disabled={hqReviewProcessing}
                                                        className="px-2.5 py-1 rounded-md bg-green-50 text-green-600 text-xs font-bold hover:bg-green-100 transition-colors disabled:opacity-50"
                                                    >
                                                        ✅ 최종승인
                                                    </button>
                                                    <button
                                                        onClick={() => { setHqReviewModalDoc(doc); setHqRejectReason(""); }}
                                                        disabled={hqReviewProcessing}
                                                        className="px-2.5 py-1 rounded-md bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                                                    >
                                                        ❌ 최종반려
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                {/* 본사 2차 심사 모달 */}
                {hqReviewModalDoc && (
                    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setHqReviewModalDoc(null); setHqRejectReason(""); }}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Eye className="h-5 w-5 text-purple-500" />
                                    본사 최종 심사
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {hqReviewModalDoc.userName} · {hqReviewModalDoc.userSubRegion} · {hqReviewModalDoc.title}
                                </p>
                                <div className="mt-2 text-xs bg-red-50 text-red-600 rounded px-2 py-1">
                                    {(hqReviewModalDoc as any).managerRejectionReason
                                        ? `영업소장 반려 사유: ${(hqReviewModalDoc as any).managerRejectionReason}`
                                        : (hqReviewModalDoc.verificationResult?.rejection_reasons?.[0]
                                            ? `AI 판독 사유: ${hqReviewModalDoc.verificationResult.rejection_reasons[0]}`
                                            : "AI OCR 판독 부적격 (영업소장 서류 직행)")
                                    }
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 space-y-4">
                                {hqReviewModalDoc.fileUrl && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 mb-2">위수탁계약서</p>
                                        <div className="flex items-center justify-center">
                                            <img
                                                src={hqReviewModalDoc.fileUrl}
                                                alt="위수탁계약서"
                                                className="max-h-[40vh] rounded-lg shadow-md border cursor-zoom-in"
                                                onClick={() => window.open(hqReviewModalDoc!.fileUrl, "_blank")}
                                            />
                                        </div>
                                    </div>
                                )}
                                {(hqReviewModalDoc as any).fileUrl2 && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 mb-2">부속합의서</p>
                                        <div className="flex items-center justify-center">
                                            <img
                                                src={(hqReviewModalDoc as any).fileUrl2}
                                                alt="부속합의서"
                                                className="max-h-[40vh] rounded-lg shadow-md border cursor-zoom-in"
                                                onClick={() => window.open((hqReviewModalDoc as any).fileUrl2, "_blank")}
                                            />
                                        </div>
                                    </div>
                                )}
                                {!hqReviewModalDoc.fileUrl && !(hqReviewModalDoc as any).fileUrl2 && (
                                    <p className="text-slate-400 py-8 text-center">이미지를 불러올 수 없습니다.</p>
                                )}
                            </div>
                            <div className="p-6 border-t space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 block mb-1">최종 반려 사유 (반려 시 기사에게 전달)</label>
                                    <input
                                        type="text"
                                        value={hqRejectReason}
                                        onChange={e => setHqRejectReason(e.target.value)}
                                        placeholder="예: 서류 위변조가 의심됩니다. 재제출이 필요합니다."
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleHQReviewAction(hqReviewModalDoc.id!, "approved")}
                                        disabled={hqReviewProcessing}
                                        className="flex-1 py-2.5 rounded-lg bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors disabled:opacity-50"
                                    >
                                        ✅ 최종 승인
                                    </button>
                                    <button
                                        onClick={() => handleHQReviewAction(hqReviewModalDoc.id!, "rejected")}
                                        disabled={hqReviewProcessing || !hqRejectReason.trim()}
                                        className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                                    >
                                        ❌ 최종 반려
                                    </button>
                                    <button
                                        onClick={() => { setHqReviewModalDoc(null); setHqRejectReason(""); }}
                                        className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-200 transition-colors"
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========== 수동 심사 대기열 ========== */}
                <Card className="shadow-lg border-0 border-l-4 border-l-yellow-400">
                    <CardHeader className="pb-3 border-b bg-yellow-50/50">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Eye className="h-5 w-5 text-yellow-500" />
                            수동 심사 대기열
                            <span className="bg-yellow-400 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                                {pendingDocs.length}건
                            </span>
                            <span className="text-xs font-normal text-slate-400 ml-1">AI OCR 부적격 판정 서류 수동 심사 대기열</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 pl-6 font-medium text-slate-500">성명</th>
                                    <th className="p-3 font-medium text-slate-500">영업소</th>
                                    <th className="p-3 font-medium text-slate-500">서류명</th>
                                    <th className="p-3 font-medium text-slate-500">업로드 시간</th>
                                    <th className="p-3 text-center font-medium text-slate-500">서류 보기</th>
                                    <th className="p-3 pr-6 text-center font-medium text-slate-500">심사</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {pendingDocs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400 font-medium bg-white">
                                            대기 중인 수동 심사 서류가 없습니다. (AI 부적격 판정 건)
                                        </td>
                                    </tr>
                                ) : (
                                    pendingDocs.map((doc, i) => (
                                        <tr key={doc.id || i} className="bg-white hover:bg-yellow-50/30">
                                            <td className="p-3 pl-6 font-bold">{doc.userName}</td>
                                            <td className="p-3 text-slate-600 text-xs">{doc.userSubRegion}</td>
                                            <td className="p-3 text-yellow-600 font-medium">{doc.title}</td>
                                            <td className="p-3 text-slate-400 text-xs">
                                                {doc.submittedAt?.toDate ? new Date(doc.submittedAt.toDate()).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => setReviewModalDoc(doc)}
                                                    className="p-1.5 rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors inline-flex"
                                                    title="서류 이미지 확대"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                            <td className="p-3 pr-6 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => handleReviewAction(doc.id!, "approved")}
                                                        disabled={reviewProcessing}
                                                        className="px-2.5 py-1 rounded-md bg-green-50 text-green-600 text-xs font-bold hover:bg-green-100 transition-colors disabled:opacity-50"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        onClick={() => setReviewModalDoc(doc)}
                                                        disabled={reviewProcessing}
                                                        className="px-2.5 py-1 rounded-md bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                                                    >
                                                        반려
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                {/* 수동 심사 모달 (이미지 확대 + 승인/반려) */}
                {reviewModalDoc && (
                    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setReviewModalDoc(null); setRejectReason(""); }}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Eye className="h-5 w-5 text-yellow-500" />
                                    수동 심사
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {reviewModalDoc.userName} · {reviewModalDoc.userSubRegion} · {reviewModalDoc.title}
                                </p>
                            </div>
                            <div className="p-6 bg-slate-50 space-y-4">
                                {reviewModalDoc.fileUrl && (
                                    <div>
                                        {(reviewModalDoc as any).fileUrl2 && <p className="text-xs font-bold text-slate-500 mb-2">위수탁계약서</p>}
                                        <div className="flex items-center justify-center">
                                            <img
                                                src={reviewModalDoc.fileUrl}
                                                alt={reviewModalDoc.title}
                                                className="max-h-[40vh] rounded-lg shadow-md border cursor-zoom-in"
                                                onClick={() => window.open(reviewModalDoc.fileUrl, "_blank")}
                                            />
                                        </div>
                                    </div>
                                )}
                                {(reviewModalDoc as any).fileUrl2 && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 mb-2">부속합의서</p>
                                        <div className="flex items-center justify-center">
                                            <img
                                                src={(reviewModalDoc as any).fileUrl2}
                                                alt="부속합의서"
                                                className="max-h-[40vh] rounded-lg shadow-md border cursor-zoom-in"
                                                onClick={() => window.open((reviewModalDoc as any).fileUrl2, "_blank")}
                                            />
                                        </div>
                                    </div>
                                )}
                                {!reviewModalDoc.fileUrl && !(reviewModalDoc as any).fileUrl2 && (
                                    <p className="text-slate-400 py-8 text-center">이미지를 불러올 수 없습니다.</p>
                                )}
                            </div>
                            {/* OCR 결과 표시 */}
                            {reviewModalDoc.verificationResult && (
                                <div className="px-6 py-3 bg-slate-50 border-t text-xs">
                                    <p className="font-bold text-slate-600 mb-1">AI OCR 판정 결과:</p>
                                    <p className="text-red-500">
                                        {reviewModalDoc.verificationResult.overall_result || "반려"}
                                        {reviewModalDoc.verificationResult.reason && ` — ${reviewModalDoc.verificationResult.reason}`}
                                    </p>
                                </div>
                            )}
                            <div className="p-6 border-t space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 block mb-1">반려 사유 (반려 시 필수)</label>
                                    <input
                                        type="text"
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="예: 서류 내용이 불일치합니다. 재업로드해주세요."
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleReviewAction(reviewModalDoc.id!, "approved")}
                                        disabled={reviewProcessing}
                                        className="flex-1 py-2.5 rounded-lg bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors disabled:opacity-50"
                                    >
                                        ✅ 승인
                                    </button>
                                    <button
                                        onClick={() => handleReviewAction(reviewModalDoc.id!, "rejected")}
                                        disabled={reviewProcessing || !rejectReason.trim()}
                                        className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                                    >
                                        ❌ 반려
                                    </button>
                                    <button
                                        onClick={() => { setReviewModalDoc(null); setRejectReason(""); }}
                                        className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-200 transition-colors"
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Recent Submissions + Management */}
                <Card className="shadow-lg border-0">
                    <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="h-5 w-5 text-letus-orange" />
                                최근 제출 내역
                                <span className="text-xs font-normal text-slate-400 ml-1">
                                    {filteredSubmissions.length}건
                                </span>
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Filters */}
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-letus-orange text-slate-600"
                                    title="날짜 필터"
                                />
                                <input
                                    type="text"
                                    placeholder="성명 검색"
                                    value={filterName}
                                    onChange={e => setFilterName(e.target.value)}
                                    className="w-20 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-letus-orange"
                                />
                                <input
                                    type="text"
                                    placeholder="영업소 검색"
                                    value={filterOffice}
                                    onChange={e => setFilterOffice(e.target.value)}
                                    className="w-24 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-letus-orange"
                                />
                                <input
                                    type="text"
                                    placeholder="서류명 검색"
                                    value={filterTitle}
                                    onChange={e => setFilterTitle(e.target.value)}
                                    className="w-28 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-letus-orange"
                                />
                                <select
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-letus-orange bg-white text-slate-600 cursor-pointer"
                                >
                                    <option value="all">모든 상태</option>
                                    <option value="approved">승인</option>
                                    <option value="submitted">제출 (판독 완료)</option>
                                    <option value="pending">수동심사 대기</option>
                                    <option value="rejected">반려</option>
                                </select>
                                {/* Reset All Button */}
                                <button
                                    onClick={handleResetAll}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="전체 초기화"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    초기화
                                </button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 pl-6 font-medium text-slate-500">성명</th>
                                    <th className="p-3 font-medium text-slate-500">영업소</th>
                                    <th className="p-3 font-medium text-slate-500">서류명</th>
                                    <th className="p-3 font-medium text-slate-500">상태</th>
                                    <th className="p-3 font-medium text-slate-500">시간</th>
                                    <th className="p-3 text-center font-medium text-slate-500">보기</th>
                                    <th className="p-3 text-center font-medium text-slate-500">다운</th>
                                    <th className="p-3 pr-6 text-center font-medium text-slate-500">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {paginatedSubmissions.length > 0 ? (
                                    paginatedSubmissions.map((s, i) => (
                                        <React.Fragment key={s.id + "-fragment"}>
                                            <tr className="bg-white hover:bg-slate-50 cursor-pointer" onClick={() => setPreviewDocId(previewDocId === s.id ? null : s.id!)}>
                                                <td className="p-3 pl-6 font-bold">{s.userName}</td>
                                                <td className="p-3 text-slate-600 text-xs">{s.userSubRegion}</td>
                                                <td className="p-3 text-letus-orange font-medium">
                                                    <div>{s.title}</div>
                                                    {(() => {
                                                        const reasonText =
                                                            s.verificationResult?.rejection_reasons?.[0] ||
                                                            s.verificationResult?.guidance_message ||
                                                            s.managerRejectionReason ||
                                                            s.rejectionReason ||
                                                            (s.status === "pending" ? "AI 심사 통과 실패 (확인 요망)" : "관리자 반려");

                                                        if ((s.status === "pending" || s.status === "rejected" || s.status === "hq_review") && reasonText) {
                                                            return (
                                                                <div className="text-[10px] text-red-500 font-normal mt-0.5 truncate max-w-[200px]" title={reasonText}>
                                                                    사유: {reasonText}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === "approved" ? "bg-green-100 text-green-700" :
                                                        s.status === "submitted" ? "bg-blue-100 text-blue-700" :
                                                            s.status === "rejected" ? "bg-red-100 text-red-600" :
                                                                "bg-yellow-100 text-yellow-700"
                                                        }`}>
                                                        {s.status === "approved"
                                                            ? (((s as any).rejectionCount || 0) > 0 ? "🔄 재제출 승인건" : "✅ 승인")
                                                            : s.status === "submitted" ? "📋 제출"
                                                                : s.status === "rejected"
                                                                    ? (s.reviewedBy && s.reviewedBy !== "admin" && s.reviewedBy !== "hq_admin" ? "❌ 영업소장 반려" : "❌ 반려")
                                                                    : "⏳ 수동심사대기"}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400 text-xs">
                                                    {s.submittedAt?.toDate ? new Date(s.submittedAt.toDate()).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {s.fileUrl ? (
                                                        <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors inline-flex" title="서류 보기">
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">-</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownloadUserDocs(s.userId, s.userName); }}
                                                        disabled={downloadingUserId === s.userId}
                                                        className="p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors inline-flex disabled:opacity-50"
                                                        title={`${s.userName} 전체 서류 ZIP 다운로드`}
                                                    >
                                                        {downloadingUserId === s.userId
                                                            ? <span className="h-3.5 w-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                                                            : <Download className="h-3.5 w-3.5" />}
                                                    </button>
                                                </td>
                                                <td className="p-3 pr-6 text-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteSubmission(s.id!); }}
                                                        className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors inline-flex"
                                                        title="제출 내역 삭제"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {previewDocId === s.id && s.fileUrl && (
                                                <tr className="bg-slate-50">
                                                    <td colSpan={8} className="p-4 border-t border-slate-100">
                                                        <div className="flex flex-col items-center">
                                                            <div className="text-xs text-slate-500 mb-2 w-full max-w-2xl text-left font-bold">미리보기 : {s.title}</div>
                                                            <img
                                                                src={s.fileUrl}
                                                                alt={s.title}
                                                                className="max-w-2xl w-full rounded-md border shadow-sm"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                                        검색 조건에 맞는 제출 내역이 없습니다.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination UI */}
                        {totalPages > 1 && (
                            <div className="p-4 border-t flex justify-center items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="text-xs h-8 px-3"
                                >
                                    이전
                                </Button>
                                <div className="text-xs text-slate-500 px-4">
                                    {currentPage} / {totalPages} 페이지
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="text-xs h-8 px-3"
                                >
                                    다음
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Section Title */}
                <div className="flex items-center gap-3 pt-4">
                    <BarChart3 className="h-6 w-6 text-letus-orange" />
                    <h2 className="text-xl font-bold">영업소별 제출 현황</h2>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{SECTION_CONFIG.length}개 섹션</span>
                </div>

                {/* Collapsible Sections — 원본 디자인 */}
                {SECTION_CONFIG.map(section => {
                    const officeDataList = section.offices.map(o => getOfficeData(o));
                    const secTotal = officeDataList.reduce((s, d) => s + d.stats.total, 0);
                    const secDocsReq = officeDataList.reduce((s, d) => s + d.docsRequired, 0);
                    const secSubmitted = officeDataList.reduce((s, d) => s + d.stats.submitted, 0);
                    const secRate = secDocsReq > 0 ? Math.round((secSubmitted / secDocsReq) * 100) : 0;
                    const isExpanded = expandedSections[section.id];

                    return (
                        <Card key={section.id} className="shadow-md border-0 overflow-hidden">
                            {/* Section Header */}
                            <div
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleSection(section.id)}
                                style={{ borderLeft: `4px solid ${section.color}` }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: section.color }}></div>
                                    <h3 className="font-bold text-base">{section.title}</h3>
                                    <span className="text-xs text-slate-400">{section.offices.length}개 영업소</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${secRate}%`, backgroundColor: section.color }}></div>
                                        </div>
                                        <span className="text-sm font-bold" style={{ color: section.color }}>{secRate}%</span>
                                    </div>
                                    <span className="text-xs text-slate-500">{secSubmitted}/{secDocsReq}건</span>
                                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </div>
                            </div>

                            {/* Section Content — table */}
                            {isExpanded && (
                                <div className="border-t">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="p-3 pl-6 text-left font-medium text-slate-500">영업소명</th>
                                                <th className="p-3 text-left font-medium text-slate-500">소장명</th>
                                                <th className="p-3 text-center font-medium text-slate-500">총원</th>
                                                <th className="p-3 text-center font-medium text-slate-500">서류총합</th>
                                                <th className="p-3 text-center font-medium text-slate-500">제출</th>
                                                <th className="p-3 text-center font-medium text-slate-500">취합률</th>
                                                <th className="p-3 text-left font-medium text-slate-500">비고</th>
                                                <th className="p-3 pr-6 text-center font-medium text-slate-500">편집</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {section.offices.map((officeName, idx) => {
                                                const d = getOfficeData(officeName);
                                                const isEditing = editingOffice === officeName;
                                                const rateColor = d.stats.rate >= 80 ? "text-green-600 bg-green-50" : d.stats.rate >= 50 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";

                                                return (
                                                    <tr key={idx} className="bg-white hover:bg-slate-50/50">
                                                        <td className="p-3 pl-6 font-medium text-slate-800">{officeName}</td>
                                                        <td className="p-3 text-slate-600">{d.managerName}</td>
                                                        {isEditing ? (
                                                            <>
                                                                <td className="p-3 text-center">
                                                                    <input type="number" className="w-16 h-8 text-center rounded border border-blue-300 bg-blue-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" value={editValues.total} onChange={e => setEditValues({ ...editValues, total: e.target.value })} />
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <input type="number" className="w-16 h-8 text-center rounded border border-blue-300 bg-blue-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" value={editValues.docsRequired} onChange={e => setEditValues({ ...editValues, docsRequired: e.target.value })} />
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <span className="text-sm font-bold text-slate-400">{d.stats.submitted}</span>
                                                                    <span className="text-[10px] text-slate-300 block">자동집계</span>
                                                                </td>
                                                                <td className="p-3 text-center"><span className="text-xs text-slate-400">—</span></td>
                                                                <td className="p-3">
                                                                    <input type="text" className="w-full h-8 px-2 rounded border border-blue-300 bg-blue-50 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="메모 입력" value={editValues.notes} onChange={e => setEditValues({ ...editValues, notes: e.target.value })} />
                                                                </td>
                                                                <td className="p-3 pr-6 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button onClick={() => saveEdit(officeName)} className="p-1.5 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                                                                        <button onClick={cancelEdit} className="p-1.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors"><X className="h-3.5 w-3.5" /></button>
                                                                    </div>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="p-3 text-center font-bold">{d.stats.total}</td>
                                                                <td className="p-3 text-center font-bold text-slate-500">{d.docsRequired}</td>
                                                                <td className="p-3 text-center font-bold" style={{ color: section.color }}>{d.stats.submitted}</td>
                                                                <td className="p-3 text-center"><span className={`text-xs font-bold px-2 py-1 rounded-full ${rateColor}`}>{d.stats.rate}%</span></td>
                                                                <td className="p-3 text-xs text-slate-400">{d.notes || ""}</td>
                                                                <td className="p-3 pr-6 text-center">
                                                                    <button onClick={() => startEdit(officeName)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-letus-orange transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {/* Section Footer */}
                                    <div className="bg-slate-50 px-6 py-3 flex justify-between items-center border-t">
                                        <span className="text-xs text-slate-500">섹션 합계</span>
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="font-medium">총원 <span className="font-bold text-slate-800">{secTotal}</span></span>
                                            <span className="font-medium">서류총합 <span className="font-bold text-slate-600">{secDocsReq}</span></span>
                                            <span className="font-medium">제출 <span className="font-bold" style={{ color: section.color }}>{secSubmitted}</span></span>
                                            <span className="font-medium">미제출 <span className="font-bold text-red-500">{secDocsReq - secSubmitted}</span></span>
                                            <span className="font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: section.color + "15", color: section.color }}>{secRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    );
                })}

                {/* ========== 영업소 랭킹보드 (하단) ========== */}
                <div className="flex items-center gap-3 pt-4">
                    <BarChart3 className="h-6 w-6 text-letus-orange" />
                    <h2 className="text-xl font-bold">영업소 랭킹보드</h2>
                    <button
                        onClick={() => setRankSortAsc(!rankSortAsc)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full transition-colors font-medium text-slate-600"
                    >
                        {rankSortAsc ? "▲ 오름차순" : "▼ 내림차순"}
                    </button>
                    <button
                        onClick={() => setRankExpanded(!rankExpanded)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full transition-colors font-medium text-slate-600"
                    >
                        {rankExpanded ? "접기" : "펼치기"}
                    </button>
                </div>

                {rankExpanded && (
                    <>
                        {/* 막대 차트 시각화 (센터별 색상) */}
                        <Card className="shadow-lg border-0">
                            <CardHeader className="pb-2 border-b">
                                <CardTitle className="text-sm text-slate-500">전체 영업소 취합률 차트</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="space-y-1.5">
                                    {rankedOffices.map((office) => {
                                        const centerColor = OFFICE_COLOR_MAP[office.subRegion] || "#94a3b8";
                                        const shortName = office.subRegion.replace(/\(.*\)/, "").trim();
                                        return (
                                            <div key={office.subRegion} className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 w-20 text-right truncate flex-shrink-0">{shortName}</span>
                                                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                                                    <div className="h-full rounded-full transition-all flex items-center justify-end pr-1" style={{ width: `${Math.max(office.docRate, 3)}%`, backgroundColor: centerColor }}>
                                                        {office.docRate >= 15 && <span className="text-[9px] text-white font-bold">{office.docRate}%</span>}
                                                    </div>
                                                </div>
                                                {office.docRate < 15 && <span className="text-[10px] font-bold text-slate-400 w-8">{office.docRate}%</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* 색상 범례 */}
                                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t text-[10px]">
                                    {SECTION_CONFIG.map(s => (
                                        <div key={s.id} className="flex items-center gap-1">
                                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }}></div>
                                            <span className="text-slate-500">{s.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 랭킹 리스트 */}
                        <Card className="shadow-lg border-0">
                            <CardContent className="p-0">
                                <div className="divide-y">
                                    {rankedOffices.map((office, idx) => {
                                        const rank = idx + 1;
                                        const isTop3 = rank <= 3;
                                        const isBottom5 = rank > rankedOffices.length - 5;
                                        const centerColor = OFFICE_COLOR_MAP[office.subRegion] || "#94a3b8";
                                        const rankBadge = isTop3
                                            ? rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"
                                            : `${rank}`;

                                        return (
                                            <div key={office.subRegion} className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 ${isBottom5 ? "bg-red-50/50" : ""
                                                }`}>
                                                <div className={`w-8 text-center font-bold text-lg flex-shrink-0 ${isTop3 ? "text-2xl" : isBottom5 ? "text-red-500" : "text-slate-400"
                                                    }`}>
                                                    {rankBadge}
                                                </div>
                                                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: centerColor }}></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-bold truncate ${isBottom5 ? "text-red-600" : "text-slate-700"}`}>
                                                        {office.subRegion}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {office.managerName} · 총원 {office.stats.total}명 · 서류총합 {office.docsRequired}건 · 제출 {office.stats.submitted}건
                                                    </div>
                                                </div>
                                                <div className="w-32 flex-shrink-0">
                                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                                        <div className="h-full rounded-full transition-all" style={{ width: `${office.docRate}%`, backgroundColor: centerColor }}></div>
                                                    </div>
                                                </div>
                                                <div className={`w-14 text-right font-bold text-sm flex-shrink-0 ${office.docRate >= 80 ? "text-green-600" : office.docRate >= 50 ? "text-yellow-600" : "text-red-600"
                                                    }`}>
                                                    {office.docRate}%
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}