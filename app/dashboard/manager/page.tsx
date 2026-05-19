"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Building2,
    LogOut,
    CheckCircle2,
    Circle,
    ChevronRight,
    ChevronDown,
    FileText,
    Users,
    Check,
    AlertCircle,
    Trash2,
    ExternalLink,
    Lock,
    Eye,
    EyeOff,
    Pencil,
    X,
    Save,
    Clock,
    Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MANAGER_CHECKLIST_TEMPLATE, COURIER_CHECKLIST_TEMPLATE } from "../../data/mock";
import { getUserDocuments, getDocumentsBySubRegion, deleteUser, updateUser, reviewDocument, FirestoreDocument } from "@/lib/firestore";
import BulkUploadZone from "@/components/BulkUploadZone";
import { downloadDocumentsAsZip } from "@/lib/downloadZip";

function ManagerDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const userId = searchParams.get("userId");
    const name = searchParams.get("name") || "영업소장";
    const region = searchParams.get("region") || "양지센터";
    const subRegion = searchParams.get("subRegion") || "영업소";
    const birthday = searchParams.get("birthday") || "";

    const [activeTab, setActiveTab] = useState<"my" | "drivers">("my");
    const [documents, setDocuments] = useState<FirestoreDocument[]>([]);
    const [driverDocuments, setDriverDocuments] = useState<FirestoreDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 비밀번호 보호
    const [driverTabUnlocked, setDriverTabUnlocked] = useState(false);
    const [managerPassword, setManagerPassword] = useState("");
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // 기사 카드 확장 (서류 상세 보기)
    const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

    // 기사 정보 수정
    const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");

    // 등록 기사 수 / 필수 서류 수 수동 설정
    const [registeredDriverCount, setRegisteredDriverCount] = useState<number | null>(null);
    const [requiredDocCount, setRequiredDocCount] = useState<number | null>(null);
    const [isEditingCounts, setIsEditingCounts] = useState(false);
    const [tempDriverCount, setTempDriverCount] = useState("");
    const [tempDocCount, setTempDocCount] = useState("");

    // 영업소장 1차 심사
    const [managerReviewDoc, setManagerReviewDoc] = useState<FirestoreDocument | null>(null);
    const [managerRejectReason, setManagerRejectReason] = useState("");
    // 영업소장 직접 반려 (기사 재업로드 요청)
    const [managerDirectRejectDoc, setManagerDirectRejectDoc] = useState<FirestoreDocument | null>(null);
    const [managerDirectRejectReason, setManagerDirectRejectReason] = useState("");
    const [managerReviewProcessing, setManagerReviewProcessing] = useState(false);

    // ZIP 다운로드 상태
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const handleDownloadMyDocs = async () => {
        setDownloadingId("my");
        try {
            const myDocsWithFiles = documents.filter(d => d.fileUrl);
            if (myDocsWithFiles.length === 0) { alert("다운로드할 서류가 없습니다."); return; }
            await downloadDocumentsAsZip(myDocsWithFiles, `${name}_영업소장_전체서류`);
        } catch (error) {
            console.error("다운로드 실패:", error);
            alert("다운로드 중 오류가 발생했습니다.");
        } finally { setDownloadingId(null); }
    };

    const handleDownloadDriverDocs = async (driverId: string, driverName: string, driverDocs: FirestoreDocument[]) => {
        setDownloadingId(driverId);
        try {
            const docsWithFiles = driverDocs.filter(d => d.fileUrl);
            if (docsWithFiles.length === 0) { alert("다운로드할 서류가 없습니다."); return; }
            await downloadDocumentsAsZip(docsWithFiles, `${driverName}_기사_전체서류`);
        } catch (error) {
            console.error("다운로드 실패:", error);
            alert("다운로드 중 오류가 발생했습니다.");
        } finally { setDownloadingId(null); }
    };

    const fetchData = async () => {
        if (!userId) { setIsLoading(false); return; }
        try {
            const [myDocs, driverDocs] = await Promise.all([
                getUserDocuments(userId),
                getDocumentsBySubRegion(subRegion, userId), // 본인(영업소장) 서류는 제외
            ]);
            setDocuments(myDocs);
            setDriverDocuments(driverDocs);
        } catch (error) {
            console.error("데이터 로드 실패:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [userId, subRegion]);

    // URL 파라미터(activeTab) 감지 및 리다이렉트 처리 추가
    useEffect(() => {
        const tab = searchParams.get("activeTab");
        if (tab === "drivers") {
            setActiveTab("drivers");
        } else {
            const params = new URLSearchParams(window.location.search);
            router.replace(`/dashboard/unified?${params.toString()}`);
        }
    }, [searchParams]);

    // localStorage에서 등록기사/서류수 복원
    useEffect(() => {
        const saved = localStorage.getItem(`driverCounts_${subRegion}`);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.driverCount) setRegisteredDriverCount(parsed.driverCount);
            if (parsed.docCount) setRequiredDocCount(parsed.docCount);
        }
    }, [subRegion]);

    // --- 내 서류 탭 데이터 ---
    const checklist = MANAGER_CHECKLIST_TEMPLATE.map(item => {
        const doc = documents.find(d => d.itemId === item.id);
        const docStatus = !doc ? "pending"
            : (doc.status === "submitted" || doc.status === "approved") ? "completed"
                : ((doc.status === "pending" || doc.status === "hq_review") && doc.fileUrl) ? "reviewing"
                    : doc.status === "rejected" ? "rejected"
                        : "pending";
        return { ...item, status: docStatus, rejectionReason: doc?.rejectionReason };
    });
    const progress = Math.round((checklist.filter(i => i.status === "completed").length / checklist.length) * 100);

    // --- 소속 기사 탭 데이터 ---
    const driverStats = useMemo(() => {
        // 필수 서류 수만 카운트 (required: true인 항목만)
        const requiredItems = COURIER_CHECKLIST_TEMPLATE.filter(t => t.required);
        const totalRequired = requiredItems.length;

        const byDriver: Record<string, { name: string; phone: string; docs: FirestoreDocument[] }> = {};
        driverDocuments.forEach(doc => {
            // 취소된 서류는 제외
            if ((doc as any).cancelledAt) return;
            const key = doc.userId;
            if (!byDriver[key]) {
                byDriver[key] = { name: doc.userName, phone: doc.userPhone, docs: [] };
            }
            byDriver[key].docs.push(doc);
        });

        return Object.entries(byDriver).map(([driverId, data]) => {
            // 제출 완료 = submitted/approved + pending(파일 있음, 심사 대기)
            const submitted = data.docs.filter(d =>
                d.status === "submitted" || d.status === "approved" ||
                (d.status === "pending" && d.fileUrl)
            ).length;
            const rate = totalRequired > 0 ? Math.round((submitted / totalRequired) * 100) : 0;
            return {
                id: driverId,
                name: data.name,
                phone: data.phone,
                submitted,
                total: totalRequired,
                rate,
                docs: data.docs,
            };
        }).sort((a, b) => b.rate - a.rate);
    }, [driverDocuments]);

    // 수동 심사 대기열: OCR 반려 → pending이고 파일 있는 서류 (이 영업소 소속)
    const pendingReviewDocs = useMemo(() => {
        return driverDocuments
            .filter(d => d.status === "pending" && d.fileUrl && !(d as any).cancelledAt)
            .sort((a, b) => {
                const ta = a.submittedAt?.toDate?.() || new Date(0);
                const tb = b.submittedAt?.toDate?.() || new Date(0);
                return tb.getTime() - ta.getTime();
            });
    }, [driverDocuments]);

    const totalDrivers = registeredDriverCount || driverStats.length;
    const docsPerDriver = requiredDocCount || (COURIER_CHECKLIST_TEMPLATE.filter(t => t.required).length);
    const totalDriverSubmitted = driverStats.reduce((s, d) => s + d.submitted, 0);
    const totalDriverRequired = totalDrivers * docsPerDriver;
    const driverOverallRate = totalDriverRequired > 0 ? Math.round((totalDriverSubmitted / totalDriverRequired) * 100) : 0;

    const saveCounts = () => {
        const dc = parseInt(tempDriverCount) || null;
        const rc = parseInt(tempDocCount) || null;
        setRegisteredDriverCount(dc);
        setRequiredDocCount(rc);
        localStorage.setItem(`driverCounts_${subRegion}`, JSON.stringify({ driverCount: dc, docCount: rc }));
        setIsEditingCounts(false);
    };

    const handleDocClick = (itemId: string, title: string) => {
        const query = new URLSearchParams(searchParams.toString());
        query.set("itemId", itemId);
        query.set("docTitle", title);
        router.push(`/upload/${itemId}?${query.toString()}`);
    };

    // 소속 기사 현황 탭 비밀번호 확인
    const handleDriverTabClick = () => {
        if (driverTabUnlocked) {
            setActiveTab("drivers");
        } else {
            setShowPasswordInput(true);
        }
    };

    const handlePasswordSubmit = () => {
        const correctPassword = process.env.NEXT_PUBLIC_MANAGER_PASSWORD || "manager2024";
        if (managerPassword === correctPassword) {
            setDriverTabUnlocked(true);
            setActiveTab("drivers");
            setShowPasswordInput(false);
            setManagerPassword("");
        } else {
            alert("비밀번호가 일치하지 않습니다.");
        }
    };

    // 기사 삭제
    const handleDeleteDriver = async (driverId: string, driverName: string) => {
        if (!confirm(`${driverName} 기사의 모든 정보와 제출 서류를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
        try {
            await deleteUser(driverId);
            alert("기사 정보가 삭제되었습니다.");
            fetchData(); // 데이터 새로고침
        } catch (error) {
            console.error("기사 삭제 실패:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    // 기사 정보 수정 시작
    const startEditingDriver = (driver: { id: string, name: string, phone: string }) => {
        setEditingDriverId(driver.id);
        setEditName(driver.name);
        setEditPhone(driver.phone);
    };

    // 기사 정보 저장
    const saveDriverChanges = async () => {
        if (!editingDriverId) return;
        try {
            await updateUser(editingDriverId, { name: editName, phone: editPhone });
            alert("정보가 수정되었습니다.");
            setEditingDriverId(null);
            fetchData(); // 데이터 새로고침
        } catch (error) {
            console.error("정보 수정 실패:", error);
            alert("수정 중 오류가 발생했습니다.");
        }
    };

    // 영업소장 1차 심사 처리 (pending 서류에 대한 수동 심사)
    const handleManagerReview = async (docId: string, action: "approved" | "rejected" | "rejected_to_hq") => {
        setManagerReviewProcessing(true);
        try {
            if (action === "rejected_to_hq") {
                if (!managerRejectReason.trim()) {
                    alert("반려 사유를 입력해주세요.");
                    setManagerReviewProcessing(false);
                    return;
                }
                await reviewDocument(docId, "rejected_to_hq", name, managerRejectReason);
                alert("📤 본사 2차 심사로 이관되었습니다.");
            } else if (action === "rejected") {
                if (!managerDirectRejectReason.trim()) {
                    alert("반려 사유를 입력해주세요.");
                    setManagerReviewProcessing(false);
                    return;
                }
                await reviewDocument(docId, "rejected", name, managerDirectRejectReason);
                alert("❌ 반려 처리되었습니다. 기사에게 재업로드 요청이 전달됩니다.");
            } else {
                await reviewDocument(docId, "approved", name);
                alert("✅ 승인되었습니다.");
            }
            setManagerReviewDoc(null);
            setManagerRejectReason("");
            setManagerDirectRejectDoc(null);
            setManagerDirectRejectReason("");
            fetchData();
        } catch (error) {
            console.error("심사 실패:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setManagerReviewProcessing(false);
        }
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
            {/* Black Header */}
            <div className="bg-letus-black text-white p-6 pb-12">
                <div className="flex justify-between items-start max-w-4xl mx-auto">
                    <div>
                        <div className="flex items-center gap-2 text-letus-orange mb-1 font-bold text-sm">
                            <Building2 className="h-4 w-4" /> {region} / {subRegion}
                        </div>
                        <h1 className="text-2xl font-bold">{name} 소장님</h1>
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
                            <div className="text-3xl font-bold text-letus-orange">
                                {activeTab === "my" ? `${progress}%` : `${driverOverallRate}%`}
                            </div>
                            <div className="text-xs text-slate-400">
                                {activeTab === "my" ? "내 서류 제출률" : "기사 취합률"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto max-w-4xl -mt-6 px-4">
                {/* Tab Switcher */}
                <div className="bg-white rounded-xl shadow-lg mb-4 p-1 flex">
                    <button
                        onClick={() => {
                            const params = new URLSearchParams(window.location.search);
                            router.push(`/dashboard/unified?${params.toString()}`);
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === "my"
                            ? "bg-letus-orange text-white shadow-md"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        <FileText className="h-4 w-4" />
                        내 서류
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "my" ? "bg-white/20" : "bg-slate-100"
                            }`}>
                            {checklist.filter(i => i.status === "completed").length}/{checklist.length}
                        </span>
                    </button>
                    <button
                        onClick={handleDriverTabClick}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === "drivers"
                            ? "bg-letus-orange text-white shadow-md"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        {driverTabUnlocked ? <Users className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        소속 기사 현황
                        {totalDrivers > 0 && driverTabUnlocked && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "drivers" ? "bg-white/20" : "bg-slate-100"
                                }`}>
                                {totalDrivers}명
                            </span>
                        )}
                    </button>
                </div>

                {/* Password Gate Modal */}
                {showPasswordInput && !driverTabUnlocked && (
                    <Card className="mb-4 shadow-lg border-letus-orange/30">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Lock className="h-5 w-5 text-letus-orange" />
                                <span className="font-bold text-sm text-letus-black">소속 기사 현황 잠금</span>
                            </div>
                            <p className="text-xs text-slate-500 mb-4">
                                영업소장 전용 기능입니다. 비밀번호를 입력해주세요.
                            </p>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="비밀번호"
                                        value={managerPassword}
                                        onChange={(e) => setManagerPassword(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <Button
                                    onClick={handlePasswordSubmit}
                                    className="bg-letus-orange text-white hover:bg-letus-orange/90 px-6"
                                >
                                    확인
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => { setShowPasswordInput(false); setManagerPassword(""); }}
                                    className="text-slate-400 px-3"
                                >
                                    취소
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}


                {/* Tab Content: 내 서류 */}
                {activeTab === "my" && (
                    <>
                        <div className="mb-6">
                            <BulkUploadZone
                                userId={userId!}
                                userName={name}
                                userPhone={searchParams.get("phone") || ""}
                                userBirthday={birthday}
                                region={region}
                                subRegion={subRegion}
                                role="manager"
                                onComplete={fetchData}
                            />
                        </div>

                        <div className="bg-white rounded-xl shadow-lg p-4 flex mb-4 items-center justify-between">
                            <h2 className="font-bold text-lg text-letus-charcoal">내 서류 제출 현황</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadMyDocs}
                                    disabled={downloadingId === "my"}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors disabled:opacity-50"
                                    title="내 서류 전체 ZIP 다운로드"
                                >
                                    {downloadingId === "my"
                                        ? <span className="h-3.5 w-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                                        : <Download className="h-3.5 w-3.5" />}
                                    전체 다운로드
                                </button>
                                <div className="text-xs text-slate-400">총 {checklist.length}개 서류</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {checklist.map(item => (
                                <Card
                                    key={item.id}
                                    className="cursor-pointer hover:shadow-md transition-shadow"
                                    onClick={() => handleDocClick(item.id, item.title)}
                                >
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div className="flex gap-3">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${item.status === "completed" ? "bg-green-100 text-green-600"
                                                : item.status === "reviewing" ? "bg-yellow-100 text-yellow-600"
                                                    : item.status === "rejected" ? "bg-red-100 text-red-500"
                                                        : "bg-slate-100 text-slate-400"
                                                }`}>
                                                {item.status === "completed" ? <CheckCircle2 className="h-5 w-5" />
                                                    : item.status === "reviewing" ? <Clock className="h-5 w-5" />
                                                        : item.status === "rejected" ? <AlertCircle className="h-5 w-5" />
                                                            : <Circle className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <div className="font-bold">{item.title}</div>
                                                <div className={`text-xs ${item.status === "completed" ? "text-green-500"
                                                    : item.status === "reviewing" ? "text-yellow-600"
                                                        : item.status === "rejected" ? "text-red-500"
                                                            : "text-slate-500"
                                                    }`}>
                                                    {item.status === "completed" ? "제출됨 ✅"
                                                        : item.status === "reviewing" ? "관리자 확인 중 ⏳"
                                                            : item.status === "rejected" ? `재업로드 요청${item.rejectionReason ? ` — ${item.rejectionReason}` : ""}`
                                                                : item.required ? "필수" : "선택"} | {item.status === "completed" || item.status === "reviewing" ? "제출됨" : "미제출"}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="text-slate-300" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                )}

                {/* Tab Content: 소속 기사 현황 */}
                {activeTab === "drivers" && driverTabUnlocked && (
                    <>
                        {/* Summary Card */}
                        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-bold text-lg text-letus-charcoal">
                                    소속 택배기사 현황
                                </h2>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">{subRegion}</span>
                                    <button
                                        onClick={() => {
                                            setTempDriverCount(registeredDriverCount?.toString() || totalDrivers.toString());
                                            setTempDocCount(requiredDocCount?.toString() || docsPerDriver.toString());
                                            setIsEditingCounts(!isEditingCounts);
                                        }}
                                        className="text-slate-300 hover:text-letus-orange transition-colors"
                                        title="등록기사 수 / 필수서류 수 수정"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* 수동 수정 UI */}
                            {isEditingCounts && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 space-y-2">
                                    <div className="text-xs font-bold text-letus-orange">📋 취합률 기준 수정</div>
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-slate-500">등록 기사 수</label>
                                            <Input
                                                type="number"
                                                value={tempDriverCount}
                                                onChange={(e) => setTempDriverCount(e.target.value)}
                                                className="h-8 text-sm"
                                                min="0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] text-slate-500">기사 1인당 필수서류 수</label>
                                            <Input
                                                type="number"
                                                value={tempDocCount}
                                                onChange={(e) => setTempDocCount(e.target.value)}
                                                className="h-8 text-sm"
                                                min="1"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setIsEditingCounts(false)}>
                                            취소
                                        </Button>
                                        <Button size="sm" className="text-xs h-7 bg-letus-orange text-white hover:bg-letus-orange/90" onClick={saveCounts}>
                                            저장
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-letus-black">{totalDrivers}</div>
                                    <div className="text-xs text-slate-500">등록 기사</div>
                                    {registeredDriverCount && registeredDriverCount !== driverStats.length && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">(접속: {driverStats.length}명)</div>
                                    )}
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-letus-orange">{totalDriverSubmitted}<span className="text-sm text-slate-400">/{totalDriverRequired}</span></div>
                                    <div className="text-xs text-slate-500">제출 / 필요</div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold" style={{ color: driverOverallRate >= 80 ? "#10B981" : driverOverallRate >= 50 ? "#F59E0B" : "#EF4444" }}>
                                        {driverOverallRate}%
                                    </div>
                                    <div className="text-xs text-slate-500">전체 취합률</div>
                                </div>
                            </div>
                        </div>

                        {/* 수동 심사 대기열 (Pending Docs) */}
                        {pendingReviewDocs.length > 0 && (
                            <Card className="shadow-sm border-0 border-l-4 border-l-yellow-400 mt-6 mb-8">
                                <div className="p-3 border-b bg-yellow-50/50">
                                    <h3 className="font-bold text-sm flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                                        수동 심사 대기열
                                        <span className="bg-yellow-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            {pendingReviewDocs.length}건
                                        </span>
                                        <span className="text-[10px] font-normal text-slate-400 ml-1">AI 통과 실패 건 — 확인 필요</span>
                                    </h3>
                                </div>
                                <div className="p-0 overflow-hidden text-sm">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 border-b">
                                            <tr>
                                                <th className="p-2.5 pl-4 font-medium text-slate-500">기사명</th>
                                                <th className="p-2.5 font-medium text-slate-500">서류명</th>
                                                <th className="p-2.5 font-medium text-slate-500 text-center">보기</th>
                                                <th className="p-2.5 pr-4 text-center font-medium text-slate-500">심사</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {pendingReviewDocs.map((doc, i) => (
                                                <tr key={doc.id || i} className="bg-white hover:bg-slate-50 transition-colors">
                                                    <td className="p-2.5 pl-4 font-medium text-slate-700">{doc.userName}</td>
                                                    <td className="p-2.5 text-letus-orange font-medium max-w-[150px]">
                                                        <div className="truncate" title={doc.title}>{doc.title}</div>
                                                        {(() => {
                                                            const reasonText =
                                                                doc.verificationResult?.rejection_reasons?.[0] ||
                                                                doc.verificationResult?.guidance_message ||
                                                                doc.managerRejectionReason ||
                                                                doc.rejectionReason ||
                                                                (doc.status === "pending" ? "AI 심사 통과 실패 (확인 요망)" : "관리자 반려");

                                                            if (reasonText) {
                                                                return (
                                                                    <div className="text-[10px] text-red-500 font-normal mt-0.5 truncate" title={reasonText}>
                                                                        사유: {reasonText}
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </td>
                                                    <td className="p-2.5 text-center">
                                                        <a href={doc.fileUrl || "#"} target="_blank" rel="noopener noreferrer"
                                                            className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors inline-block"
                                                            title="서류 보기"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                    </td>
                                                    <td className="p-2.5 pr-4">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleManagerReview(doc.id!, "approved");
                                                                }}
                                                                disabled={managerReviewProcessing}
                                                                className="px-2 py-1 text-[10px] font-bold rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                                                            >
                                                                ✅ 승인
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setManagerDirectRejectDoc(doc);
                                                                    setManagerDirectRejectReason("");
                                                                }}
                                                                disabled={managerReviewProcessing}
                                                                className="px-2 py-1 text-[10px] font-bold rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                                                            >
                                                                ❌ 반려
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setManagerReviewDoc(doc);
                                                                    setManagerRejectReason("");
                                                                }}
                                                                disabled={managerReviewProcessing}
                                                                className="px-2 py-1 text-[10px] font-bold rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors disabled:opacity-50"
                                                            >
                                                                📤 이관
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {/* Driver List */}
                        {driverStats.length > 0 ? (
                            <div className="space-y-3">
                                {driverStats.map(driver => {
                                    const rateColor = driver.rate >= 80 ? "text-green-600" : driver.rate >= 50 ? "text-yellow-600" : "text-red-500";
                                    const barColor = driver.rate >= 80 ? "bg-green-500" : driver.rate >= 50 ? "bg-yellow-500" : "bg-red-500";
                                    const isExpanded = expandedDriver === driver.id;
                                    const isEditing = editingDriverId === driver.id;

                                    return (
                                        <Card key={driver.id} className="shadow-sm border-0 overflow-hidden hover:shadow-md transition-shadow">
                                            <CardContent className="p-4">
                                                {/* Driver Header */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center ${driver.rate === 100 ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"
                                                            }`}>
                                                            {driver.rate === 100
                                                                ? <Check className="h-5 w-5" />
                                                                : <span className="text-sm font-bold">{driver.name.charAt(0)}</span>
                                                            }
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            {isEditing ? (
                                                                <div className="flex flex-col gap-1 -mt-1">
                                                                    <Input
                                                                        value={editName}
                                                                        onChange={(e) => setEditName(e.target.value)}
                                                                        className="h-7 text-xs py-1"
                                                                        placeholder="이름"
                                                                        autoFocus
                                                                    />
                                                                    <Input
                                                                        value={editPhone}
                                                                        onChange={(e) => setEditPhone(e.target.value)}
                                                                        className="h-7 text-xs py-1"
                                                                        placeholder="전화번호"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className="cursor-pointer"
                                                                    onClick={() => setExpandedDriver(isExpanded ? null : driver.id)}
                                                                >
                                                                    <div className="font-bold text-sm truncate">{driver.name}</div>
                                                                    <div className="text-xs text-slate-400">
                                                                        {driver.phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1-****-$3")}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {isEditing ? (
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                    onClick={saveDriverChanges}
                                                                >
                                                                    <Save className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                                                    onClick={() => setEditingDriverId(null)}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 p-0 text-slate-300 hover:text-letus-orange hover:bg-orange-50"
                                                                    onClick={() => startEditingDriver(driver)}
                                                                    title="수정"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                                    onClick={() => handleDeleteDriver(driver.id, driver.name)}
                                                                    title="삭제"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <div className="w-px h-4 bg-slate-100 mx-1"></div>
                                                                <div className="text-right mr-1">
                                                                    <div className={`text-lg font-bold ${rateColor}`}>{driver.rate}%</div>
                                                                </div>
                                                                <ChevronDown
                                                                    className={`h-4 w-4 text-slate-300 cursor-pointer transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                                    onClick={() => setExpandedDriver(isExpanded ? null : driver.id)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                {!isEditing && (
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div
                                                            className={`${barColor} h-2 rounded-full transition-all`}
                                                            style={{ width: `${driver.rate}%` }}
                                                        ></div>
                                                    </div>
                                                )}

                                                {/* Document status dots */}
                                                {!isEditing && (
                                                    <div className="flex gap-1 mt-2">
                                                        {COURIER_CHECKLIST_TEMPLATE.map(tmpl => {
                                                            const isSubmitted = driver.docs.some(
                                                                d => d.itemId === tmpl.id && (d.status === "submitted" || d.status === "approved")
                                                            );
                                                            return (
                                                                <div
                                                                    key={tmpl.id}
                                                                    title={tmpl.title}
                                                                    className={`flex-1 h-1.5 rounded-full ${isSubmitted ? barColor : "bg-slate-200"}`}
                                                                ></div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Expanded: 서류 상세 목록 */}
                                                {isExpanded && !isEditing && (
                                                    <div className="mt-4 pt-3 border-t border-slate-100">
                                                        <div className="text-xs font-bold text-slate-500 mb-2 flex items-center justify-between">
                                                            <div className="flex items-center gap-1">
                                                                <FileText className="h-3 w-3" /> 서류 상세 ({driver.submitted}/{driver.total})
                                                                <span className="ml-1 text-[10px] text-slate-400 font-normal">— 제출 서류를 승인하거나 본사로 이관하세요</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDownloadDriverDocs(driver.id, driver.name, driver.docs)}
                                                                disabled={downloadingId === driver.id}
                                                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors disabled:opacity-50"
                                                                title={`${driver.name} 전체 서류 ZIP 다운로드`}
                                                            >
                                                                {downloadingId === driver.id
                                                                    ? <span className="h-3 w-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                                                                    : <Download className="h-3 w-3" />}
                                                                다운로드
                                                            </button>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {COURIER_CHECKLIST_TEMPLATE.map(tmpl => {
                                                                const docItem = driver.docs.find(d => d.itemId === tmpl.id);
                                                                const isSubmitted = docItem && (docItem.status === "submitted" || docItem.status === "approved" || docItem.status === "pending");
                                                                const isApproved = docItem?.status === "approved";
                                                                const isPending = docItem?.status === "pending";
                                                                const isSubmittedOnly = docItem?.status === "submitted";
                                                                const submittedAt = docItem?.submittedAt
                                                                    ? new Date((docItem.submittedAt as { seconds: number }).seconds * 1000).toLocaleDateString("ko-KR")
                                                                    : null;

                                                                return (
                                                                    <div
                                                                        key={tmpl.id}
                                                                        className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${isApproved ? "bg-emerald-50" : isSubmittedOnly ? "bg-blue-50" : isPending ? "bg-yellow-50" : "bg-slate-50"}`}
                                                                    >
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isApproved ? "bg-emerald-500" : isSubmittedOnly ? "bg-blue-500" : isPending ? "bg-yellow-500" : "bg-slate-300"}`}></div>
                                                                            <span className={`truncate ${isSubmitted ? "text-slate-700" : "text-slate-400"}`}>
                                                                                {tmpl.title}
                                                                            </span>
                                                                            {isApproved && <span className="text-[10px] text-emerald-600 font-bold">승인 완료</span>}
                                                                            {isSubmittedOnly && <span className="text-[10px] text-blue-600 font-bold">판독 완료</span>}
                                                                            {isPending && <span className="text-[10px] text-yellow-600 font-bold">수동 심사 대기</span>}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                                                            {isSubmitted ? (
                                                                                <>
                                                                                    {submittedAt && (
                                                                                        <span className="text-xs text-slate-400">{submittedAt}</span>
                                                                                    )}
                                                                                    {docItem?.fileUrl && (
                                                                                        <a
                                                                                            href={docItem.fileUrl}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="p-1 rounded hover:bg-green-100 text-green-600 transition-colors"
                                                                                            title="서류 보기"
                                                                                        >
                                                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                                                        </a>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <span className="text-xs text-slate-400">미제출</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <Card className="shadow-sm border-0">
                                <CardContent className="p-8 text-center">
                                    <AlertCircle className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                                    <p className="text-slate-500 font-medium">등록된 택배기사가 없습니다</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        택배기사가 &quot;{subRegion}&quot;으로 로그인하여 서류를 제출하면 이곳에 표시됩니다.
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* 영업소장 직접 반려 모달 (기사 재업로드 요청) */}
                        {managerDirectRejectDoc && (
                            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setManagerDirectRejectDoc(null); setManagerDirectRejectReason(""); }}>
                                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                                    <div className="p-5 border-b">
                                        <h3 className="font-bold text-base flex items-center gap-2">
                                            ❌ 서류 반려
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {managerDirectRejectDoc.userName} · {managerDirectRejectDoc.title}
                                        </p>
                                        <p className="text-xs text-red-500 mt-1 bg-red-50 rounded px-2 py-1">
                                            ⚠️ 반려 시 기사님에게 재업로드 요청이 전달됩니다.
                                        </p>
                                    </div>
                                    {managerDirectRejectDoc.fileUrl && (
                                        <div className="p-4 bg-slate-50 flex justify-center">
                                            <img
                                                src={managerDirectRejectDoc.fileUrl}
                                                alt={managerDirectRejectDoc.title}
                                                className="max-h-48 rounded-lg border shadow-sm cursor-zoom-in"
                                                onClick={() => window.open(managerDirectRejectDoc!.fileUrl, "_blank")}
                                            />
                                        </div>
                                    )}
                                    <div className="p-5 space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-slate-500 block mb-1">반려 사유 (필수 — 기사에게 전달됩니다)</label>
                                            <input
                                                type="text"
                                                value={managerDirectRejectReason}
                                                onChange={e => setManagerDirectRejectReason(e.target.value)}
                                                placeholder="예: 서류 내용이 불일치합니다. 재업로드해주세요."
                                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleManagerReview(managerDirectRejectDoc.id!, "rejected")}
                                                disabled={managerReviewProcessing || !managerDirectRejectReason.trim()}
                                                className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                                            >
                                                ❌ 반려 처리
                                            </button>
                                            <button
                                                onClick={() => { setManagerDirectRejectDoc(null); setManagerDirectRejectReason(""); }}
                                                className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-200 transition-colors"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 영업소장 이관 모달 (본사 2차 심사) */}
                        {managerReviewDoc && (
                            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setManagerReviewDoc(null); setManagerRejectReason(""); }}>
                                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                                    <div className="p-5 border-b">
                                        <h3 className="font-bold text-base flex items-center gap-2">
                                            📤 본사 2차 심사 이관
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {managerReviewDoc.userName} · {managerReviewDoc.title}
                                        </p>
                                        <p className="text-xs text-orange-500 mt-1 bg-orange-50 rounded px-2 py-1">
                                            ⚠️ 이관 시 기사님에게 돌아가지 않고 본사로 전달됩니다.
                                        </p>
                                    </div>
                                    {managerReviewDoc.fileUrl && (
                                        <div className="p-4 bg-slate-50 flex justify-center">
                                            <img
                                                src={managerReviewDoc.fileUrl}
                                                alt={managerReviewDoc.title}
                                                className="max-h-48 rounded-lg border shadow-sm cursor-zoom-in"
                                                onClick={() => window.open(managerReviewDoc!.fileUrl, "_blank")}
                                            />
                                        </div>
                                    )}
                                    <div className="p-5 space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-slate-500 block mb-1">이관 사유 (필수 — 본사에 전달됩니다)</label>
                                            <input
                                                type="text"
                                                value={managerRejectReason}
                                                onChange={e => setManagerRejectReason(e.target.value)}
                                                placeholder="예: 서류 판별이 어렵습니다. 본사 확인 요청합니다."
                                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => handleManagerReview(managerReviewDoc.id!, "rejected_to_hq")}
                                                disabled={managerReviewProcessing || !managerRejectReason.trim()}
                                                className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold text-sm hover:bg-purple-600 transition-colors disabled:opacity-50"
                                            >
                                                📤 본사로 이관
                                            </button>
                                            <button
                                                onClick={() => { setManagerReviewDoc(null); setManagerRejectReason(""); }}
                                                className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-200 transition-colors"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function ManagerDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <ManagerDashboardContent />
        </Suspense>
    );
}
