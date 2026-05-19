"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Home,
    Search,
    Archive,
    Trash2,
    RefreshCw,
    ChevronDown,
    RotateCcw,
    Pencil,
    X,
    Save,
    Check,
    AlertCircle,
    ExternalLink,
    Eye,
    FileText,
    Download,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDocumentsBySubRegion, reviewDocument, cancelDocument, FirestoreDocument } from "@/lib/firestore";
import { deleteDocumentFile } from "@/lib/storage";
import { downloadDocumentsAsZip } from "@/lib/downloadZip";

function RegionAdminDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const center = searchParams.get("center") || "";
    const subRegion = searchParams.get("subRegion") || "";

    const [teams, setTeams] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterName, setFilterName] = useState("");
    const [filterPlate, setFilterPlate] = useState("");
    const [archivedExpanded, setArchivedExpanded] = useState(false);
    
    // 서브 탭 분류 ('manager' = 권역장/영업소장, 'driver' = 시공팀/기사)
    const [activeSubTab, setActiveSubTab] = useState<'manager' | 'driver'>('manager');

    // 정보 수정 모달 상태
    const [editingTeam, setEditingTeam] = useState<any | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    // 신규 추가: 수동 심사 대기열 및 모달 상태
    const [pendingReviewDocs, setPendingReviewDocs] = useState<FirestoreDocument[]>([]);
    const [managerReviewDoc, setManagerReviewDoc] = useState<FirestoreDocument | null>(null);
    const [managerRejectReason, setManagerRejectReason] = useState("");
    const [managerDirectRejectDoc, setManagerDirectRejectDoc] = useState<FirestoreDocument | null>(null);
    const [managerDirectRejectReason, setManagerDirectRejectReason] = useState("");
    const [managerReviewProcessing, setManagerReviewProcessing] = useState(false);

    // 최근 제출 내역 관련 상태
    const [allSubRegionDocs, setAllSubRegionDocs] = useState<FirestoreDocument[]>([]);
    const [docFilterName, setDocFilterName] = useState("");
    const [docFilterTitle, setDocFilterTitle] = useState("");
    const [docFilterStatus, setDocFilterStatus] = useState("all");
    const [docSelectedDate, setDocSelectedDate] = useState("");
    const [docCurrentPage, setDocCurrentPage] = useState(1);
    const [previewDocId, setPreviewDocId] = useState<string | null>(null);
    const [downloadingUserId, setDownloadingUserId] = useState<string | null>(null);
    const docItemsPerPage = 8;

    // 제출현황 탭 ('summary' = 건수, 'rate' = 취합률)
    const [statsTab, setStatsTab] = useState<"summary" | "rate">("summary");
    // 인원별 필요 서류수 오버라이드 (편집 가능, localStorage 저장)
    const [driverDocsOverrides, setDriverDocsOverrides] = useState<Record<string, number>>(() => {
        if (typeof window === "undefined") return {};
        const saved = localStorage.getItem(`letus_driver_docsreq_${subRegion}`);
        return saved ? JSON.parse(saved) : {};
    });
    const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
    const [editingDocsValue, setEditingDocsValue] = useState("");

    // 수동 심사 서류 + 전체 서류 패치 함수
    const fetchPendingDocs = async () => {
        if (!subRegion) return;
        try {
            const docs = await getDocumentsBySubRegion(subRegion);
            // 전체 서류 저장 (최근 제출 내역용)
            setAllSubRegionDocs(docs);
            // 수동 심사 대기열 (택배기사 pending만)
            const pending = docs
                .filter(d => 
                    d.status === "pending"
                    && d.fileUrl 
                    && !(d as any).cancelledAt
                    && d.userRole !== "manager"
                )
                .sort((a, b) => {
                    const ta = a.submittedAt?.toDate?.() || new Date(0);
                    const tb = b.submittedAt?.toDate?.() || new Date(0);
                    return tb.getTime() - ta.getTime();
                });
            setPendingReviewDocs(pending);
        } catch (e) {
            console.error("수동 심사 대기열 로드 실패:", e);
        }
    };

    const fetchTeams = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (center) params.set("center", center);
            if (subRegion) params.set("subRegion", subRegion);
            const res = await fetch(`/api/construction-sheet?${params.toString()}`);
            if (res.ok) setTeams(await res.json());

            // 수동 심사 서류 대기열도 함께 패치
            await fetchPendingDocs();
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (!center && !subRegion) { router.push("/"); return; }
        fetchTeams();
    }, [center, subRegion]);

    const filteredTeams = useMemo(() => teams.filter(t =>
        t.status !== "보관"
        && t.name.toLowerCase().includes(filterName.trim().toLowerCase())
        && (t.licensePlate || "").toLowerCase().includes(filterPlate.trim().toLowerCase())
    ), [teams, filterName, filterPlate]);

    const archivedTeams = useMemo(() => teams.filter(t => t.status === "보관"), [teams]);
    const activeTeams = useMemo(() => teams.filter(t => t.status !== "보관"), [teams]);

    // 각 역할(role)별 필터링
    const filteredManagers = useMemo(() => filteredTeams.filter(t => t.role === 'manager'), [filteredTeams]);
    const filteredDrivers = useMemo(() => filteredTeams.filter(t => t.role === 'driver'), [filteredTeams]);

    const activeManagers = useMemo(() => activeTeams.filter(t => t.role === 'manager'), [activeTeams]);
    const activeDrivers = useMemo(() => activeTeams.filter(t => t.role === 'driver'), [activeTeams]);

    const archivedManagers = useMemo(() => archivedTeams.filter(t => t.role === 'manager'), [archivedTeams]);
    const archivedDrivers = useMemo(() => archivedTeams.filter(t => t.role === 'driver'), [archivedTeams]);

    const postAction = async (body: any) => {
        const res = await fetch("/api/construction-sheet", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) fetchTeams(); else alert("처리에 실패했습니다.");
    };

    const handleUpdateStatus = (id: string, cur: string) => {
        const [role, rowIndexStr] = id.split('_');
        postAction({ action: "updateStatus", rowIndex: parseInt(rowIndexStr, 10), role, status: cur === "재직 중" ? "퇴사" : "재직 중" });
    };

    const handleArchive = (id: string) => {
        if (!confirm("이 기사를 보관 처리하시겠습니까?")) return;
        const [role, rowIndexStr] = id.split('_');
        postAction({ action: "updateStatus", rowIndex: parseInt(rowIndexStr, 10), role, status: "보관" });
    };

    const handleRestore = (id: string) => {
        const [role, rowIndexStr] = id.split('_');
        postAction({ action: "updateStatus", rowIndex: parseInt(rowIndexStr, 10), role, status: "재직 중" });
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`정말 ${name} 기사를 영구 삭제하시겠습니까?`)) return;
        const [role, rowIndexStr] = id.split('_');
        const res = await fetch(`/api/construction-sheet?rowIndex=${rowIndexStr}&role=${role}`, { method: "DELETE" });
        if (res.ok) fetchTeams(); else alert("삭제에 실패했습니다.");
    };

    // 수정 모달 열기 핸들러
    const startEditing = (t: any) => {
        setEditingTeam(t);
        setEditForm({
            name: t.name || "",
            birthday: t.birthday || "",
            phone: t.phone || "",
            email: t.email || "",
            address: t.address || "",
            vehicleName: t.vehicleName || "",
            licensePlate: t.licensePlate || "",
            fuelType: t.fuelType || "",
            vehicleType: t.vehicleType || "",
            plateType: t.plateType || "",
            platePurpose: t.platePurpose || "",
            co2Emission: t.co2Emission || "",
            cargoLicenseNum: t.cargoLicenseNum || "",
            cargoLicenseDate: t.cargoLicenseDate || "",
            loadingCapacity: t.loadingCapacity || "",
            driverLicenseType: t.driverLicenseType || "",
            driverLicenseNum: t.driverLicenseNum || "",
            status: t.status || "재직 중",
        });
    };

    // 수정 완료 저장 핸들러
    const handleSaveEdit = async () => {
        if (!editingTeam) return;
        setIsSaving(true);
        try {
            const [role, rowIndexStr] = editingTeam.id.split('_');
            const res = await fetch("/api/construction-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "updateTeam",
                    rowIndex: parseInt(rowIndexStr, 10),
                    role,
                    fields: editForm,
                }),
            });
            if (res.ok) {
                alert("정보가 성공적으로 수정되었습니다.");
                setEditingTeam(null);
                fetchTeams();
            } else {
                alert("정보 수정에 실패했습니다.");
            }
        } catch (e) {
            console.error(e);
            alert("처리 중 에러가 발생했습니다.");
        } finally {
            setIsSaving(false);
        }
    };

    // 신규 추가: 권역장 1차 심사 처리 (pending 서류에 대한 수동 심사)
    const handleManagerReview = async (docId: string, action: "approved" | "rejected" | "rejected_to_hq") => {
        setManagerReviewProcessing(true);
        try {
            if (action === "rejected_to_hq") {
                if (!managerRejectReason.trim()) {
                    alert("본사이관 사유를 입력해주세요.");
                    setManagerReviewProcessing(false);
                    return;
                }
                await reviewDocument(docId, "rejected_to_hq", "권역장", managerRejectReason);
                alert("📤 본사 2차 심사로 이관되었습니다.");
            } else if (action === "rejected") {
                if (!managerDirectRejectReason.trim()) {
                    alert("반려 사유를 입력해주세요.");
                    setManagerReviewProcessing(false);
                    return;
                }
                await reviewDocument(docId, "rejected", "권역장", managerDirectRejectReason);
                alert("❌ 반려 처리되었습니다. 기사님에게 재업로드 요청이 전달됩니다.");
            } else {
                await reviewDocument(docId, "approved", "권역장");
                alert("✅ 승인되었습니다.");
            }
            setManagerReviewDoc(null);
            setManagerRejectReason("");
            setManagerDirectRejectDoc(null);
            setManagerDirectRejectReason("");
            fetchTeams(); // 실시간 데이터 및 대기열 리로드
        } catch (error) {
            console.error("심사 실패:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setManagerReviewProcessing(false);
        }
    };

    // ===== 최근 제출 내역 필터 + 페이지네이션 =====
    const filteredDocs = useMemo(() => {
        let result = allSubRegionDocs
            .filter(s =>
                (s.status === "submitted" || s.status === "approved" || s.status === "rejected" ||
                 s.status === "hq_review" || (s.status === "pending" && s.fileUrl))
            )
            .sort((a, b) => {
                const ta = a.submittedAt?.toDate?.() || new Date(0);
                const tb = b.submittedAt?.toDate?.() || new Date(0);
                return tb.getTime() - ta.getTime();
            });
        if (docSelectedDate) {
            result = result.filter(s => {
                const time = s.submittedAt?.toDate?.();
                if (!time) return false;
                const d = new Date(time);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === docSelectedDate;
            });
        }
        if (docFilterName.trim()) result = result.filter(s => s.userName?.toLowerCase().includes(docFilterName.trim().toLowerCase()));
        if (docFilterTitle.trim()) result = result.filter(s => s.title?.toLowerCase().includes(docFilterTitle.trim().toLowerCase()));
        if (docFilterStatus !== "all") {
            if (docFilterStatus === "pending") result = result.filter(s => s.status === "pending" || s.status === "hq_review");
            else result = result.filter(s => s.status === docFilterStatus);
        }
        return result;
    }, [allSubRegionDocs, docSelectedDate, docFilterName, docFilterTitle, docFilterStatus]);

    useEffect(() => { setDocCurrentPage(1); }, [docSelectedDate, docFilterName, docFilterTitle, docFilterStatus]);

    const paginatedDocs = useMemo(() => {
        const start = (docCurrentPage - 1) * docItemsPerPage;
        return filteredDocs.slice(start, start + docItemsPerPage);
    }, [filteredDocs, docCurrentPage]);
    const docTotalPages = Math.ceil(filteredDocs.length / docItemsPerPage);

    // 영업소 제출현황 통계
    const submittedCount = allSubRegionDocs.filter(d => d.status === "submitted" || d.status === "approved").length;
    const pendingCount = allSubRegionDocs.filter(d => d.status === "pending" && d.fileUrl).length;
    const rejectedCount = allSubRegionDocs.filter(d => d.status === "rejected").length;
    const hqReviewCount = allSubRegionDocs.filter(d => d.status === "hq_review").length;

    // 인원별 제출 현황 (취합률 탭용)
    const perUserStats = useMemo(() => {
        const userMap = new Map<string, { userId: string; userName: string; userRole: string; submitted: number; total: number }>();
        allSubRegionDocs.forEach(d => {
            if (!d.userId || !d.fileUrl) return;
            if (!userMap.has(d.userId)) {
                userMap.set(d.userId, {
                    userId: d.userId,
                    userName: d.userName || "-",
                    userRole: d.userRole || "driver",
                    submitted: 0,
                    total: 0,
                });
            }
            const u = userMap.get(d.userId)!;
            u.total++;
            if (d.status === "submitted" || d.status === "approved") u.submitted++;
        });
        return Array.from(userMap.values()).sort((a, b) => a.userName.localeCompare(b.userName));
    }, [allSubRegionDocs]);

    const getRequiredDocs = (userId: string, userRole: string) => {
        if (driverDocsOverrides[userId] !== undefined) return driverDocsOverrides[userId];
        return userRole === "manager" ? 13 : 8; // 기본값: 영업소장 13종, 택배기사 8종
    };

    const totalRequiredAll = perUserStats.reduce((sum, u) => sum + getRequiredDocs(u.userId, u.userRole), 0);
    const totalSubmittedAll = perUserStats.reduce((sum, u) => sum + u.submitted, 0);
    const overallRate = totalRequiredAll > 0 ? Math.round((totalSubmittedAll / totalRequiredAll) * 100) : 0;

    const saveDriverDocsOverride = (userId: string, value: number) => {
        const next = { ...driverDocsOverrides, [userId]: value };
        setDriverDocsOverrides(next);
        localStorage.setItem(`letus_driver_docsreq_${subRegion}`, JSON.stringify(next));
        setEditingDriverId(null);
    };

    // ZIP 다운로드
    const handleDownloadUserDocs = async (targetUserId: string, targetUserName: string) => {
        setDownloadingUserId(targetUserId);
        try {
            const userDocs = allSubRegionDocs.filter(s =>
                s.userId === targetUserId && s.fileUrl &&
                (s.status === "submitted" || s.status === "approved" || s.status === "hq_review" || (s.status === "pending" && s.fileUrl))
            );
            if (userDocs.length === 0) { alert("다운로드할 서류가 없습니다."); return; }
            await downloadDocumentsAsZip(userDocs, `${targetUserName}_전체서류`);
        } catch (error) {
            console.error("다운로드 실패:", error);
            alert("다운로드 중 오류가 발생했습니다.");
        } finally { setDownloadingUserId(null); }
    };

    // 제출 삭제
    const handleDeleteSubmission = async (docId: string) => {
        if (!confirm("이 제출 내역을 삭제(취소 처리)하시겠습니까?")) return;
        try {
            const target = allSubRegionDocs.find(s => s.id === docId);
            await cancelDocument(docId);
            if (target) {
                const urlsToDelete = [target.fileUrl, (target as any).fileUrl2, ...((target as any).fileUrls || [])].filter(Boolean) as string[];
                await Promise.allSettled(urlsToDelete.map(url => deleteDocumentFile(url)));
            }
            setAllSubRegionDocs(prev => prev.filter(s => s.id !== docId));
            fetchTeams();
        } catch (error) {
            console.error("삭제 실패:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    /* 공통 테이블 컴포넌트 */
    const TeamTable = ({ data, showRestore }: { data: any[]; showRestore?: boolean }) => (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="p-2.5 pl-4 font-medium text-slate-500">이름</th>
                        <th className="p-2.5 font-medium text-slate-500">생년월일</th>
                        <th className="p-2.5 font-medium text-slate-500">연락처</th>
                        <th className="p-2.5 font-medium text-slate-500">이메일</th>
                        <th className="p-2.5 font-medium text-slate-500">주소</th>
                        <th className="p-2.5 font-medium text-slate-500">차명</th>
                        <th className="p-2.5 font-medium text-slate-500">차량번호</th>
                        <th className="p-2.5 font-medium text-slate-500">연료</th>
                        <th className="p-2.5 font-medium text-slate-500">차량형태</th>
                        <th className="p-2.5 font-medium text-slate-500">번호판</th>
                        <th className="p-2.5 font-medium text-slate-500">CO₂</th>
                        <th className="p-2.5 text-center font-medium text-slate-500">재직</th>
                        <th className="p-2.5 pr-4 text-center font-medium text-slate-500">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {data.length === 0 ? (
                        <tr><td colSpan={13} className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr>
                    ) : data.map((t, i) => (
                        <tr key={t.id || i} className="bg-white hover:bg-slate-50 transition-colors">
                            <td className="p-2.5 pl-4 font-bold text-slate-800">{t.name}</td>
                            <td className="p-2.5 text-slate-600">{t.birthday || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.phone}</td>
                            <td className="p-2.5 text-slate-500">{t.email || "-"}</td>
                            <td className="p-2.5 text-slate-500 max-w-[120px] truncate" title={t.address}>{t.address || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.vehicleName || "-"}</td>
                            <td className="p-2.5 font-medium text-blue-600">{t.licensePlate || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.fuelType || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.vehicleType || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.plateType || "-"}</td>
                            <td className="p-2.5 text-slate-600">{t.co2Emission || "-"}</td>
                            <td className="p-2.5 text-center">
                                {showRestore ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-500">보관</span>
                                ) : (
                                    <button
                                        onClick={() => handleUpdateStatus(t.id, t.status)}
                                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${t.status === "재직 중" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                                    >{t.status}</button>
                                )}
                            </td>
                            <td className="p-2.5 pr-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                    {/* 정보 전체 수정 버튼 */}
                                    {!showRestore && (
                                        <button onClick={() => startEditing(t)} className="p-1.5 rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100" title="정보 수정">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {showRestore ? (
                                        <button onClick={() => handleRestore(t.id)} className="p-1.5 rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100" title="복원">
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                    ) : (
                                        <button onClick={() => handleArchive(t.id)} className="p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200" title="보관">
                                            <Archive className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(t.id, t.name)} className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100" title="삭제">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-letus-black text-white p-6 pb-12">
                <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold">권역장 대시보드</h1>
                            <p className="text-blue-400 text-sm mt-1 font-medium">{subRegion || center}</p>
                            <p className="text-slate-500 text-xs mt-0.5">{center} · 소속 시공팀 현황 및 차량 관리</p>
                        </div>
                        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => router.push("/")}>
                            <Home className="h-4 w-4 mr-2" /> 초기화면
                        </Button>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-orange-400">{overallRate}%</div>
                            <div className="text-xs text-slate-400 mt-1">전체 취합률</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-blue-400">
                                {activeSubTab === 'manager' 
                                    ? activeManagers.filter(t => t.status === "재직 중").length 
                                    : activeDrivers.filter(t => t.status === "재직 중").length}
                                <span className="text-sm font-normal text-slate-400 ml-1">명</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">재직 중인 기사</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-red-400">
                                {activeSubTab === 'manager' 
                                    ? activeManagers.filter(t => t.status === "퇴사").length 
                                    : activeDrivers.filter(t => t.status === "퇴사").length}
                                <span className="text-sm font-normal text-slate-400 ml-1">명</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">퇴사 처리됨</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4">
                            <div className="text-3xl font-bold text-slate-400">
                                {activeSubTab === 'manager' ? activeManagers.length : activeDrivers.length}
                                <span className="text-sm font-normal text-slate-500 ml-1">명</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">총 등록자</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 -mt-6 pb-12 space-y-4">
                
                {/* 신규 추가: 수동 심사 대기열 (Pending Docs) */}
                <Card className="shadow-lg border-0 border-l-4 border-l-yellow-400 bg-white">
                    <div className="p-4 border-b bg-yellow-50/50 flex justify-between items-center rounded-t-xl">
                        <h3 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                            수동 심사 대기열
                            <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {pendingReviewDocs.length}건
                            </span>
                            <span className="text-xs font-normal text-slate-400 ml-1">AI OCR 판정 보류 서류 — 권역장 확인 필요</span>
                        </h3>
                    </div>
                    <div className="p-0 overflow-hidden text-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="p-3 pl-6 font-medium text-slate-500">기사명</th>
                                        <th className="p-3 font-medium text-slate-500">서류명</th>
                                        <th className="p-3 font-medium text-slate-500 text-center">서류 보기</th>
                                        <th className="p-3 pr-6 text-center font-medium text-slate-500">심사</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pendingReviewDocs.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400 font-medium bg-white">
                                                대기 중인 수동 심사 서류가 없습니다. (AI OCR 부적격 판정 건)
                                            </td>
                                        </tr>
                                    ) : (
                                        pendingReviewDocs.map((doc, i) => (
                                            <tr key={doc.id || i} className="bg-white hover:bg-slate-50 transition-colors">
                                                <td className="p-3 pl-6 font-bold text-slate-800">{doc.userName}</td>
                                                <td className="p-3 text-slate-700 font-medium">
                                                    <div className="text-blue-600 font-semibold">{doc.title}</div>
                                                    {(() => {
                                                        const reasonText =
                                                            doc.verificationResult?.rejection_reasons?.[0] ||
                                                            doc.verificationResult?.guidance_message ||
                                                            doc.managerRejectionReason ||
                                                            doc.rejectionReason ||
                                                            (doc.status === "pending" ? "AI 심사 통과 실패 (확인 요망)" : "관리자 반려");

                                                        if (reasonText) {
                                                            return (
                                                                <div className="text-[10px] text-red-500 font-normal mt-0.5 truncate max-w-[200px]" title={reasonText}>
                                                                    사유: {reasonText}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {doc.fileUrl && (
                                                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                                            className="p-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors inline-block"
                                                            title="서류 보기"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                    )}
                                                </td>
                                                <td className="p-3 pr-6">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (confirm("이 서류를 승인처리 하시겠습니까?")) {
                                                                    handleManagerReview(doc.id!, "approved");
                                                                }
                                                            }}
                                                            disabled={managerReviewProcessing}
                                                            className="px-2.5 py-1 text-xs font-bold rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
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
                                                            className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
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
                                                            className="px-2.5 py-1 text-xs font-bold rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors disabled:opacity-50"
                                                        >
                                                            📤 본사이관
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Card>

                {/* ========== 영업소 서류 제출 현황 (탭: 건수 / 취합률) ========== */}
                <Card className="shadow-lg border-0">
                    <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-blue-500" />
                                영업소 서류 제출 현황
                                <span className="text-xs font-normal text-slate-400 ml-1">{subRegion}</span>
                            </CardTitle>
                            <div className="flex bg-slate-100 rounded-lg p-0.5">
                                <button onClick={() => setStatsTab("summary")}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${statsTab === "summary" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                    제출 건수
                                </button>
                                <button onClick={() => setStatsTab("rate")}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${statsTab === "rate" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                    취합률
                                </button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                        {statsTab === "summary" ? (
                            /* ── 제출 건수 탭 (기존) ── */
                            <div className="grid grid-cols-5 gap-3">
                                <div className="bg-blue-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-blue-600">{submittedCount + pendingCount + rejectedCount + hqReviewCount}</div>
                                    <div className="text-xs text-slate-500 mt-1">전체 제출</div>
                                </div>
                                <div className="bg-green-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-green-600">{submittedCount}</div>
                                    <div className="text-xs text-slate-500 mt-1">제출/승인</div>
                                </div>
                                <div className="bg-yellow-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                                    <div className="text-xs text-slate-500 mt-1">심사대기</div>
                                </div>
                                <div className="bg-purple-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-purple-600">{hqReviewCount}</div>
                                    <div className="text-xs text-slate-500 mt-1">본사이관</div>
                                </div>
                                <div className="bg-red-50 rounded-xl p-4 text-center">
                                    <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                                    <div className="text-xs text-slate-500 mt-1">반려</div>
                                </div>
                            </div>
                        ) : (
                            /* ── 취합률 탭 (신규) ── */
                            <div className="space-y-4">
                                {/* 전체 취합률 요약 */}
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-center text-white">
                                        <div className="text-3xl font-bold">{overallRate}%</div>
                                        <div className="text-xs text-blue-100 mt-1">전체 취합률</div>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                                        <div className="text-2xl font-bold text-slate-700">{perUserStats.length}<span className="text-sm font-normal text-slate-400 ml-1">명</span></div>
                                        <div className="text-xs text-slate-500 mt-1">등록 인원</div>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-4 text-center">
                                        <div className="text-2xl font-bold text-green-600">{totalSubmittedAll}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
                                        <div className="text-xs text-slate-500 mt-1">제출 완료</div>
                                    </div>
                                    <div className="bg-orange-50 rounded-xl p-4 text-center">
                                        <div className="text-2xl font-bold text-orange-600">{totalRequiredAll}<span className="text-sm font-normal text-slate-400 ml-1">건</span></div>
                                        <div className="text-xs text-slate-500 mt-1">서류총합</div>
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400">※ 취합률 = (제출/승인 건수 ÷ 필요 서류수) × 100 | 필요 서류수 편집 가능 (기본: 택배기사 8종, 영업소장 13종)</p>

                                {/* 인원별 취합률 테이블 */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 border-b">
                                            <tr>
                                                <th className="p-3 pl-4 font-medium text-slate-500">성명</th>
                                                <th className="p-3 font-medium text-slate-500">구분</th>
                                                <th className="p-3 text-center font-medium text-slate-500">필요 서류수</th>
                                                <th className="p-3 text-center font-medium text-slate-500">제출</th>
                                                <th className="p-3 text-center font-medium text-slate-500">미제출</th>
                                                <th className="p-3 font-medium text-slate-500">취합률</th>
                                                <th className="p-3 pr-4 text-center font-medium text-slate-500">편집</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {perUserStats.length === 0 ? (
                                                <tr><td colSpan={7} className="p-8 text-center text-slate-400">등록된 인원이 없습니다.</td></tr>
                                            ) : (
                                                perUserStats.map((u) => {
                                                    const req = getRequiredDocs(u.userId, u.userRole);
                                                    const rate = req > 0 ? Math.round((u.submitted / req) * 100) : 0;
                                                    const missing = Math.max(0, req - u.submitted);
                                                    const isEditing = editingDriverId === u.userId;
                                                    const rateColor = rate >= 100 ? "text-green-600 bg-green-50" : rate >= 50 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";
                                                    return (
                                                        <tr key={u.userId} className="bg-white hover:bg-slate-50/50">
                                                            <td className="p-3 pl-4 font-bold text-slate-800">{u.userName}</td>
                                                            <td className="p-3">
                                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${u.userRole === "manager" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                                                                    {u.userRole === "manager" ? "영업소장" : "기사"}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                {isEditing ? (
                                                                    <input type="number" className="w-14 h-7 text-center rounded border border-blue-300 bg-blue-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                        value={editingDocsValue}
                                                                        onChange={e => setEditingDocsValue(e.target.value)}
                                                                        onKeyDown={e => { if (e.key === "Enter") saveDriverDocsOverride(u.userId, parseInt(editingDocsValue) || 8); }}
                                                                        autoFocus />
                                                                ) : (
                                                                    <span className="font-bold">{req}</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-center font-bold text-green-600">{u.submitted}</td>
                                                            <td className="p-3 text-center font-bold text-red-500">{missing}</td>
                                                            <td className="p-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: rate >= 100 ? "#16a34a" : rate >= 50 ? "#ca8a04" : "#dc2626" }}></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rateColor}`}>{rate}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 pr-4 text-center">
                                                                {isEditing ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button onClick={() => saveDriverDocsOverride(u.userId, parseInt(editingDocsValue) || 8)}
                                                                            className="p-1 rounded bg-green-100 text-green-700 hover:bg-green-200"><Check className="h-3.5 w-3.5" /></button>
                                                                        <button onClick={() => setEditingDriverId(null)}
                                                                            className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="h-3.5 w-3.5" /></button>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={() => { setEditingDriverId(u.userId); setEditingDocsValue(String(req)); }}
                                                                        className="p-1 rounded text-slate-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        {/* ↓ 여기부터 추가 */}
                                        {perUserStats.length > 0 && (
                                            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                                                <tr className="font-bold">
                                                    <td className="p-3 pl-4 text-slate-700">합계</td>
                                                    <td className="p-3 text-xs text-slate-500">{perUserStats.length}명</td>
                                                    <td className="p-3 text-center text-slate-700">{totalRequiredAll}</td>
                                                    <td className="p-3 text-center text-green-600">{totalSubmittedAll}</td>
                                                    <td className="p-3 text-center text-red-500">{Math.max(0, totalRequiredAll - totalSubmittedAll)}</td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-20 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(overallRate, 100)}%`, backgroundColor: overallRate >= 100 ? "#16a34a" : overallRate >= 50 ? "#ca8a04" : "#dc2626" }}></div>
                                                            </div>
                                                            <span className={`text-sm font-bold px-2 py-0.5 rounded ${overallRate >= 100 ? "text-green-600 bg-green-50" : overallRate >= 50 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50"}`}>{overallRate}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 pr-4"></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                        {/* ↑ 여기까지 추가 */}
                                    </table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ========== 최근 제출 내역 ========== */}
                <Card className="shadow-lg border-0">
                    <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-500" />
                                최근 제출 내역
                                <span className="text-xs font-normal text-slate-400 ml-1">{filteredDocs.length}건</span>
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                                <input type="date" value={docSelectedDate} onChange={e => setDocSelectedDate(e.target.value)}
                                    className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600" />
                                <input type="text" placeholder="성명 검색" value={docFilterName} onChange={e => setDocFilterName(e.target.value)}
                                    className="w-20 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <input type="text" placeholder="서류명 검색" value={docFilterTitle} onChange={e => setDocFilterTitle(e.target.value)}
                                    className="w-28 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <select value={docFilterStatus} onChange={e => setDocFilterStatus(e.target.value)}
                                    className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-600 cursor-pointer">
                                    <option value="all">모든 상태</option>
                                    <option value="approved">승인</option>
                                    <option value="submitted">제출</option>
                                    <option value="pending">심사대기</option>
                                    <option value="rejected">반려</option>
                                </select>
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
                                {paginatedDocs.length > 0 ? (
                                    paginatedDocs.map((s) => (
                                        <React.Fragment key={s.id + "-frag"}>
                                            <tr className="bg-white hover:bg-slate-50 cursor-pointer" onClick={() => setPreviewDocId(previewDocId === s.id ? null : s.id!)}>
                                                <td className="p-3 pl-6 font-bold">{s.userName}</td>
                                                <td className="p-3 text-slate-600 text-xs">{s.userSubRegion}</td>
                                                <td className="p-3 text-blue-600 font-medium">
                                                    <div>{s.title}</div>
                                                    {(s.status === "pending" || s.status === "rejected" || s.status === "hq_review") && (
                                                        <div className="text-[10px] text-red-500 font-normal mt-0.5 truncate max-w-[200px]">
                                                            사유: {s.verificationResult?.rejection_reasons?.[0] || s.managerRejectionReason || s.rejectionReason || "AI 판독 부적격"}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        s.status === "approved" ? "bg-green-100 text-green-700" :
                                                        s.status === "submitted" ? "bg-blue-100 text-blue-700" :
                                                        s.status === "rejected" ? "bg-red-100 text-red-600" :
                                                        s.status === "hq_review" ? "bg-purple-100 text-purple-700" :
                                                        "bg-yellow-100 text-yellow-700"
                                                    }`}>
                                                        {s.status === "approved" ? "✅ 승인" :
                                                         s.status === "submitted" ? "📋 제출" :
                                                         s.status === "rejected" ? "❌ 반려" :
                                                         s.status === "hq_review" ? "📤 본사이관" :
                                                         "⏳ 심사대기"}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400 text-xs">
                                                    {s.submittedAt?.toDate ? new Date(s.submittedAt.toDate()).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {s.fileUrl ? (
                                                        <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                            className="p-1.5 rounded-md bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors inline-flex" title="서류 보기">
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </a>
                                                    ) : <span className="text-xs text-slate-300">-</span>}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownloadUserDocs(s.userId, s.userName); }}
                                                        disabled={downloadingUserId === s.userId}
                                                        className="p-1.5 rounded-md bg-purple-50 text-purple-500 hover:bg-purple-100 transition-colors inline-flex disabled:opacity-50"
                                                        title={`${s.userName} 전체 서류 ZIP 다운로드`}>
                                                        {downloadingUserId === s.userId
                                                            ? <span className="h-3.5 w-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                                                            : <Download className="h-3.5 w-3.5" />}
                                                    </button>
                                                </td>
                                                <td className="p-3 pr-6 text-center">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSubmission(s.id!); }}
                                                        className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors inline-flex" title="제출 삭제">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {previewDocId === s.id && s.fileUrl && (
                                                <tr className="bg-slate-50">
                                                    <td colSpan={8} className="p-4 border-t border-slate-100">
                                                        <div className="flex flex-col items-center">
                                                            <div className="text-xs text-slate-500 mb-2 w-full max-w-2xl text-left font-bold">미리보기 : {s.title}</div>
                                                            <img src={s.fileUrl} alt={s.title} className="max-w-2xl w-full rounded-md border shadow-sm" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">검색 조건에 맞는 제출 내역이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                        {docTotalPages > 1 && (
                            <div className="p-4 border-t flex justify-center items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setDocCurrentPage(p => Math.max(1, p - 1))} disabled={docCurrentPage === 1} className="text-xs h-8 px-3">이전</Button>
                                <div className="text-xs text-slate-500 px-4">{docCurrentPage} / {docTotalPages} 페이지</div>
                                <Button variant="outline" size="sm" onClick={() => setDocCurrentPage(p => Math.min(docTotalPages, p + 1))} disabled={docCurrentPage === docTotalPages} className="text-xs h-8 px-3">다음</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 탭 컨트롤러 */}
                <div className="bg-white rounded-xl shadow-lg mb-4 p-1.5 flex border border-slate-100">
                    <button
                        onClick={() => setActiveSubTab("manager")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
                            activeSubTab === "manager"
                                ? "bg-blue-600 text-white shadow-md"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                        (권역장) 등록목록
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            activeSubTab === "manager" ? "bg-white/20" : "bg-slate-100"
                        }`}>
                            {filteredManagers.length}명
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveSubTab("driver")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
                            activeSubTab === "driver"
                                ? "bg-blue-600 text-white shadow-md"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                        시공팀 등록목록
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            activeSubTab === "driver" ? "bg-white/20" : "bg-slate-100"
                        }`}>
                            {filteredDrivers.length}명
                        </span>
                    </button>
                </div>

                {/* 시공팀 등록 목록 */}
                <Card className="shadow-lg border-0">
                    <CardHeader className="pb-3 border-b bg-white rounded-t-xl">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
                                {activeSubTab === 'manager' ? '(권역장) 등록 목록' : '시공팀 등록 목록'}
                                <span className="text-xs font-normal text-slate-400 ml-1">
                                    {activeSubTab === 'manager' ? filteredManagers.length : filteredDrivers.length}명
                                </span>
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={fetchTeams} className="text-xs">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> 새로고침
                                </Button>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input placeholder="이름 검색" className="pl-8 h-8 text-xs w-32" value={filterName} onChange={e => setFilterName(e.target.value)} />
                                </div>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <Input placeholder="차량번호 검색" className="pl-8 h-8 text-xs w-32" value={filterPlate} onChange={e => setFilterPlate(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <TeamTable data={activeSubTab === 'manager' ? filteredManagers : filteredDrivers} />
                    </CardContent>
                </Card>

                {/* 보관 목록 (접이식) */}
                <Card className="shadow border-0">
                    <CardHeader
                        className="cursor-pointer hover:bg-slate-50 transition-colors rounded-xl py-4"
                        onClick={() => setArchivedExpanded(!archivedExpanded)}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2 text-slate-600">
                                <Archive className="w-4 h-4 text-slate-400" />
                                보관 목록
                                <span className="text-xs font-normal text-slate-400">
                                    {activeSubTab === 'manager' ? archivedManagers.length : archivedDrivers.length}명
                                </span>
                            </CardTitle>
                            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${archivedExpanded ? "rotate-180" : ""}`} />
                        </div>
                    </CardHeader>
                    {archivedExpanded && (
                        <CardContent className="p-0 border-t">
                            <TeamTable data={activeSubTab === 'manager' ? archivedManagers : archivedDrivers} showRestore />
                        </CardContent>
                    )}
                </Card>
            </div>

            {/* 정보 수정 모달 (Edit Team Modal) */}
            {editingTeam && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditingTeam(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b flex justify-between items-center bg-slate-50 sticky top-0 z-10">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    <Pencil className="h-5 w-5 text-blue-500" />
                                    정보 수정 및 편집 ({editingTeam.name})
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {editingTeam.role === 'manager' ? '영업소장(권역장)' : '택배기사(시공팀)'}의 모든 기재된 정보를 직접 수정합니다.
                                </p>
                            </div>
                            <button onClick={() => setEditingTeam(null)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* 1. 개인 정보 */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-blue-600 border-b pb-1">👤 개인 정보</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">이름</label>
                                        <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">생년월일 (6자리)</label>
                                        <Input value={editForm.birthday} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">연락처</label>
                                        <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">이메일</label>
                                        <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">거주지 주소</label>
                                    <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                                </div>
                            </div>

                            {/* 2. 차량 정보 */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-blue-600 border-b pb-1">🚚 차량 정보</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">차명</label>
                                        <Input value={editForm.vehicleName} onChange={e => setEditForm({ ...editForm, vehicleName: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">차량번호</label>
                                        <Input value={editForm.licensePlate} onChange={e => setEditForm({ ...editForm, licensePlate: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">연료</label>
                                        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={editForm.fuelType} onChange={e => setEditForm({ ...editForm, fuelType: e.target.value })}>
                                            <option value="">선택</option>
                                            <option value="경유">경유</option>
                                            <option value="휘발유">휘발유</option>
                                            <option value="전기">전기</option>
                                            <option value="LPG">LPG</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">차량형태</label>
                                        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={editForm.vehicleType} onChange={e => setEditForm({ ...editForm, vehicleType: e.target.value })}>
                                            <option value="">선택</option>
                                            <option value="밴형">밴형</option>
                                            <option value="탑형">탑형</option>
                                            <option value="오픈배드형">오픈배드형</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">번호판 구분</label>
                                        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={editForm.plateType} onChange={e => setEditForm({ ...editForm, plateType: e.target.value })}>
                                            <option value="">선택</option>
                                            <option value="일반번호판">일반번호판</option>
                                            <option value="'배'번호판">&apos;배&apos;번호판</option>
                                            <option value="영업용번호판">영업용번호판</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">번호판 종류(용도)</label>
                                        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={editForm.platePurpose} onChange={e => setEditForm({ ...editForm, platePurpose: e.target.value })}>
                                            <option value="">선택</option>
                                            <option value="자가용">자가용</option>
                                            <option value="영업용">영업용</option>
                                            <option value="관용">관용</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">CO2 배출량 (g/km)</label>
                                        <Input value={editForm.co2Emission} onChange={e => setEditForm({ ...editForm, co2Emission: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">적재함형태/적재량</label>
                                        <Input value={editForm.loadingCapacity} onChange={e => setEditForm({ ...editForm, loadingCapacity: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* 3. 자격 및 면허 정보 */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-blue-600 border-b pb-1">🪪 자격 및 면허 정보</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">화물운송종사자격증번호</label>
                                        <Input value={editForm.cargoLicenseNum} onChange={e => setEditForm({ ...editForm, cargoLicenseNum: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">종사자격증 취득일</label>
                                        <Input value={editForm.cargoLicenseDate} onChange={e => setEditForm({ ...editForm, cargoLicenseDate: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">운전면허종류</label>
                                        <Input value={editForm.driverLicenseType} onChange={e => setEditForm({ ...editForm, driverLicenseType: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">운전면허번호</label>
                                        <Input value={editForm.driverLicenseNum} onChange={e => setEditForm({ ...editForm, driverLicenseNum: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t bg-slate-50 flex gap-3 justify-end sticky bottom-0 z-10">
                            <Button variant="outline" onClick={() => setEditingTeam(null)} disabled={isSaving}>
                                취소
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 shadow-md">
                                {isSaving ? "저장 중..." : "저장 완료"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 권역장 1차 반려 모달 */}
            {managerDirectRejectDoc && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setManagerDirectRejectDoc(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b">
                            <h3 className="font-bold text-lg text-slate-800">❌ 1차 심사 반려</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                {managerDirectRejectDoc.userName} · {managerDirectRejectDoc.title}
                            </p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">반려 사유 (기사에게 재업로드 안내로 전달됨)</label>
                                <textarea
                                    className="w-full border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-red-300"
                                    value={managerDirectRejectReason}
                                    onChange={e => setManagerDirectRejectReason(e.target.value)}
                                    placeholder="예: 서류 내용이 불일치하거나 마스킹 처리가 미흡합니다. 다시 업로드해주세요."
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t bg-slate-50 flex gap-3 justify-end rounded-b-2xl">
                            <Button variant="outline" onClick={() => setManagerDirectRejectDoc(null)} disabled={managerReviewProcessing}>
                                취소
                            </Button>
                            <Button
                                onClick={() => handleManagerReview(managerDirectRejectDoc.id!, "rejected")}
                                disabled={managerReviewProcessing || !managerDirectRejectReason.trim()}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold"
                            >
                                반려 완료
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 권역장 본사 이관 모달 */}
            {managerReviewDoc && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setManagerReviewDoc(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b">
                            <h3 className="font-bold text-lg text-slate-800">📤 본사 2차 심사 이관</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                {managerReviewDoc.userName} · {managerReviewDoc.title}
                            </p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">이관 사유 및 특이사항 입력</label>
                                <textarea
                                    className="w-full border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-purple-300"
                                    value={managerRejectReason}
                                    onChange={e => setManagerRejectReason(e.target.value)}
                                    placeholder="예: 위수탁계약서 날인 유무가 애매하여 본사 확인이 필요합니다."
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t bg-slate-50 flex gap-3 justify-end rounded-b-2xl">
                            <Button variant="outline" onClick={() => setManagerReviewDoc(null)} disabled={managerReviewProcessing}>
                                취소
                            </Button>
                            <Button
                                onClick={() => handleManagerReview(managerReviewDoc.id!, "rejected_to_hq")}
                                disabled={managerReviewProcessing || !managerRejectReason.trim()}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
                            >
                                이관 완료
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RegionAdminDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <RegionAdminDashboardContent />
        </Suspense>
    );
}
