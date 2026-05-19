"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    ShieldCheck, LogOut, ChevronRight, ChevronLeft, ArrowRight, User, Truck,
    CheckCircle2, Loader2, FileText, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import StepIndicator from "@/components/StepIndicator";
import BulkUploadZone from "@/components/BulkUploadZone";
import ManualInputModal, { ManualInputResult } from "@/components/ManualInputModal";
import { getUserDocuments, FirestoreDocument, submitDocument } from "@/lib/firestore";
import { COURIER_CHECKLIST_TEMPLATE, MANAGER_CHECKLIST_TEMPLATE } from "@/app/data/mock";

const STEPS = [
    { label: "서류 업로드", icon: "📄" },
    { label: "수동 보완", icon: "✏️" },
    { label: "시공팀 정보", icon: "👤" },
    { label: "완료", icon: "✅" },
];

interface OcrResultItem {
    fileId: string;
    fileName: string;
    docType: string;
    overallResult: string;
    extractedData: Record<string, string>;
    extractionStatus?: Record<string, "success" | "failed">;
    rejectionReasons: string[];
    fileUrl: string;
    itemId: string;
    isDocumentRejected?: boolean;
    hasExtractionFailed?: boolean;
}

function UnifiedDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const userId = searchParams.get("userId") || "";
    const name = searchParams.get("name") || "";
    const phone = searchParams.get("phone") || "";
    const birthday = searchParams.get("birthday") || "";
    const region = searchParams.get("region") || "";
    const subRegion = searchParams.get("subRegion") || "";
    const role = (searchParams.get("role") || "driver") as "manager" | "driver";

    const [currentStep, setCurrentStep] = useState(1);
    const [documents, setDocuments] = useState<FirestoreDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // OCR results
    const [ocrResults, setOcrResults] = useState<OcrResultItem[]>([]);
    const [rejectedItems, setRejectedItems] = useState<OcrResultItem[]>([]);
    const [currentFallbackIdx, setCurrentFallbackIdx] = useState(0);
    const [showManualModal, setShowManualModal] = useState(false);

    // Construction team info
    const [personal, setPersonal] = useState({
        name: name, birthday: birthday, phone: phone, email: "", address: "",
    });
    const [vehicle, setVehicle] = useState({
        vehicleName: "", licensePlate: "", fuelType: "", vehicleType: "", plateType: "", co2Emission: "", platePurpose: "", loadingCapacity: "",
    });
    const [activeInfoTab, setActiveInfoTab] = useState<"personal" | "vehicle">("personal");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = async () => {
        if (!userId) { setIsLoading(false); return; }
        try {
            const docs = await getUserDocuments(userId);
            console.log(`[Unified] fetchData: userId="${userId}", docs=${docs.length}, itemIds=[${docs.map(d => d.itemId).join(', ')}]`);
            setDocuments(docs);
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchData(); }, [userId]);

    const checklist = (role === "manager" ? MANAGER_CHECKLIST_TEMPLATE : COURIER_CHECKLIST_TEMPLATE).map(item => {
        const doc = documents.find(d => d.itemId === item.id);
        const isWaitingReview = doc && (doc.status === "pending" || doc.status === "hq_review" || (doc.status === "rejected" && !(doc as any).reviewedAt)) && doc.fileUrl;
        const docStatus = !doc ? "pending"
            : (doc.status === "submitted" || doc.status === "approved") ? "completed"
                : isWaitingReview ? "reviewing"
                    : doc.status === "rejected" ? "rejected" : "pending";
        return { ...item, status: docStatus };
    });

    const completedCount = checklist.filter(i => i.status === "completed" || i.status === "reviewing").length;
    const progress = Math.round((completedCount / checklist.length) * 100);

    // 추출된/수동입력된 데이터를 바탕으로 시공팀 정보 자동 채우기
    const updateTeamInfoFromData = (data: Record<string, string> | undefined) => {
        if (!data) return;

        setPersonal(prev => {
            return {
                ...prev,
                // 이름, 생년월일, 연락처는 처음 접속값 유지 (prev값 그대로 보존)
                email: data["이메일"] || prev.email,
                address: data["거주지주소"] || prev.address,
            };
        });

        setVehicle(prev => ({
            ...prev,
            vehicleName: data["차량명"] || data["차종"] || prev.vehicleName,
            licensePlate: data["차량번호"] || data["자동차등록번호"] || prev.licensePlate,
            fuelType: data["연료종류"] || data["연료의종류"] || prev.fuelType,
            vehicleType: data["차량종류"] || prev.vehicleType,
            plateType: data["번호판종류"] || data["용도"] || prev.plateType,
            platePurpose: data["용도"] || data["번호판종류(용도)"] || prev.platePurpose,
            co2Emission: data["이산화탄소배출량"] ? data["이산화탄소배출량"].replace(/[^0-9.]/g, "") : prev.co2Emission,
            loadingCapacity: data["최대적재량"] || data["적재함형태/적재량"] || prev.loadingCapacity,
        }));
    };

    // 개별 서류 업로드 클릭 핸들러
    const handleDocClick = (itemId: string, title: string) => {
        const query = new URLSearchParams(searchParams.toString());
        query.set("itemId", itemId);
        query.set("docTitle", title);
        router.push(`/upload/${itemId}?${query.toString()}`);
    };

    // OCR complete handler
    const handleOcrComplete = (results: OcrResultItem[]) => {
        setOcrResults(results);
        
        // 개인정보 추출에 실패한 서류만 수동 입력 모달 띄움 (서류 반려는 재업로드 유도)
        const extractionFailedItems = results.filter(r => r.hasExtractionFailed);
        setRejectedItems(extractionFailedItems);
        if (extractionFailedItems.length > 0) {
            setCurrentFallbackIdx(0);
            setShowManualModal(true);
            setCurrentStep(2);
        }

        // 자동차등록증 데이터가 있다면 Pre-fill 자동 할당
        const carRegDoc = results.find(r => r.docType === "자동차등록증" && r.overallResult === "적합");
        if (carRegDoc && carRegDoc.extractedData) {
            updateTeamInfoFromData(carRegDoc.extractedData);
        }
    };

    // Manual input submit
    const handleManualSubmit = async (result: ManualInputResult) => {
        // 수동 입력 데이터를 이용해 시공팀 정보 자동 할당
        updateTeamInfoFromData(result.manualData);
        try {
            // Sheets에 수동 입력 데이터 기록
            await fetch("/api/construction-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "manualInput",
                    docType: result.docType,
                    name: name,
                    phone: phone,
                    userBirthday: birthday,
                    rowData: result.manualData,
                    fileUrl: rejectedItems[currentFallbackIdx]?.fileUrl || "",
                    dataSource: "OCR+수동보완",
                    role,
                    center: region,
                    subRegion,
                }),
            });

            // Firestore에 manualInputData 저장
            const item = rejectedItems[currentFallbackIdx];
            if (item && userId) {
                const isDocRejected = item.isDocumentRejected || item.overallResult === "반려";
                const preservedStatus = isDocRejected
                    ? (role === "manager" ? "hq_review" : "pending")
                    : "submitted";
                await submitDocument({
                    userId, userName: name, userPhone: phone,
                    userRegion: region, userSubRegion: subRegion, userRole: role,
                    itemId: item.itemId, title: item.docType,
                    fileUrl: item.fileUrl, fileName: item.fileName,
                    verificationResult: { ...item.extractedData, manualOverride: result.manualData },
                }, preservedStatus, 0); // BulkUploadZone에서 이미 카운트 증가했으므로 0
            }
        } catch (e) { console.error("수동 입력 저장 오류:", e); }

        // 다음 반려 항목으로 이동
        if (currentFallbackIdx < rejectedItems.length - 1) {
            setCurrentFallbackIdx(prev => prev + 1);
        } else {
            setShowManualModal(false);
        }
    };

    const handleSkipFallback = () => {
        if (currentFallbackIdx < rejectedItems.length - 1) {
            setCurrentFallbackIdx(prev => prev + 1);
        } else {
            setShowManualModal(false);
        }
    };

    // Construction team personal info submit
    const handlePersonalSubmit = async () => {
        if (!personal.name || !personal.birthday || !personal.phone || !personal.email || !personal.address) {
            alert("모든 항목을 입력해주세요."); return;
        }
        setIsSubmitting(true);
        try {
            await fetch("/api/construction-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    center: region, subRegion, role, ...personal,
                }),
            });

            alert("개인정보가 등록되었습니다. 차량정보를 추가로 입력할 수 있습니다.");
            setActiveInfoTab("vehicle");
        } catch { alert("등록 중 오류가 발생했습니다."); }
        finally { setIsSubmitting(false); }
    };

    // Vehicle info submit
    const handleVehicleSubmit = async () => {
        if (!vehicle.vehicleName || !vehicle.licensePlate || !vehicle.fuelType || !vehicle.vehicleType || !vehicle.plateType || !vehicle.co2Emission || !vehicle.platePurpose || !vehicle.loadingCapacity) {
            alert("차량 정보의 모든 항목을 입력해주세요."); return;
        }
        setIsSubmitting(true);
        try {
            await fetch("/api/construction-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "updateVehicle",
                    name: personal.name, birthday: personal.birthday,
                    phone: personal.phone, role, ...vehicle,
                }),
            });
            setCurrentStep(4);
        } catch (err: any) { alert(err.message || "등록 중 오류가 발생했습니다."); }
        finally { setIsSubmitting(false); }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-br from-letus-charcoal to-letus-black text-white p-5 pb-10 rounded-b-[2rem] shadow-xl">
                <div className="max-w-2xl mx-auto">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 text-letus-orange mb-1 font-bold text-sm">
                                <ShieldCheck className="h-4 w-4" /> {region} · {subRegion}
                            </div>
                            <h1 className="text-xl font-bold">{name}님, 환영합니다</h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {role === "manager" ? "영업소장" : "택배기사"} · 서류 제출 {progress}% 완료
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {role === "manager" && (
                                <Button
                                    variant="ghost"
                                    className="text-white border border-white/20 hover:bg-white/10 h-9 px-3 text-sm font-bold shadow-sm flex items-center gap-1.5"
                                    onClick={() => {
                                        const params = new URLSearchParams(window.location.search);
                                        params.set("activeTab", "drivers");
                                        router.push(`/dashboard/manager?${params.toString()}`);
                                    }}
                                >
                                    <Users className="h-4 w-4 text-letus-orange animate-pulse" /> 소속 기사 관리
                                </Button>
                            )}
                            <Button variant="ghost" className="text-white hover:bg-white/10 h-9 px-3 text-sm" onClick={() => router.push("/")}>
                                <LogOut className="h-4 w-4 mr-1" /> 나가기
                            </Button>
                        </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-4 w-full bg-white/10 rounded-full h-1.5">
                        <div className="bg-letus-orange h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>

            {/* Step Indicator */}
            <div className="max-w-2xl mx-auto px-4 -mt-5">
                <div className="bg-white rounded-xl shadow-lg p-4">
                    <StepIndicator currentStep={currentStep} steps={STEPS} />
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">

                {/* ===== Step 1: 서류 업로드 ===== */}
                {currentStep === 1 && (
                    <>
                        <BulkUploadZone
                            userId={userId} userName={name} userPhone={phone}
                            region={region} subRegion={subRegion} userBirthday={birthday} role={role}
                            onComplete={fetchData} onOcrComplete={handleOcrComplete}
                        />

                        {/* 서류 체크리스트 */}
                        <Card className="shadow-md border-0">
                            <CardContent className="p-0 divide-y">
                                <div className="px-4 py-3 bg-slate-50 border-b">
                                    <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-letus-orange" />
                                        제출 현황 ({completedCount}/{checklist.length})
                                    </h3>
                                </div>
                                {checklist.map(item => (
                                    <div 
                                        key={item.id} 
                                        className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                                        onClick={() => handleDocClick(item.id, item.title)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                item.status === "completed" ? "bg-green-500" :
                                                item.status === "reviewing" ? "bg-yellow-500" :
                                                item.status === "rejected" ? "bg-red-500" : "bg-slate-300"
                                            }`} />
                                            <span className="text-sm font-medium text-slate-700">{item.title}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium ${
                                                item.status === "completed" ? "text-green-600" :
                                                item.status === "reviewing" ? "text-yellow-600" :
                                                item.status === "rejected" ? "text-red-500" : "text-slate-400"
                                            }`}>
                                                {item.status === "completed" ? "✅ 완료" :
                                                 item.status === "reviewing" ? "⏳ 심사중" :
                                                 item.status === "rejected" ? "❌ 반려 (재업로드 필요)" :
                                                 item.required ? "필수" : "선택"}
                                            </span>
                                            <ChevronRight className="h-4 w-4 text-slate-300" />
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {/* 다음 버튼 (서류 미완료라도 진행 가능) */}
                        {ocrResults.some(r => ["운전면허증", "자동차등록증"].includes(r.docType)) ? (
                            <Button
                                className="w-full h-12 text-base font-bold bg-letus-orange hover:bg-letus-orange/90 text-white shadow-lg shadow-orange-100"
                                onClick={() => setCurrentStep(3)}
                            >
                                다음: 시공팀 정보 확인 및 보완 <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="w-1/3 h-12 text-slate-600 bg-white"
                                    onClick={() => setCurrentStep(3)}
                                >
                                    정보 확인/수정
                                </Button>
                                <Button
                                    className="flex-1 h-12 text-base font-bold bg-letus-orange hover:bg-letus-orange/90 text-white shadow-lg shadow-orange-100"
                                    onClick={() => setCurrentStep(4)}
                                >
                                    다음: 제출 완료하기 <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        <p className="text-center text-[11px] text-slate-400 mt-2">
                            * 서류가 모두 업로드되지 않아도 다음 단계로 진행할 수 있습니다.
                        </p>
                    </>
                )}

                {/* ===== Step 2: 수동 보완 (자동 모달) ===== */}
                {currentStep === 2 && (
                    <div className="text-center space-y-4 py-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
                            <span className="text-2xl">✏️</span>
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">수동 입력 보완 진행 중</h2>
                        <p className="text-sm text-slate-500">
                            AI가 인식하지 못한 {rejectedItems.length}건의 서류를 보완하고 있습니다.
                            <br />({currentFallbackIdx + 1}/{rejectedItems.length})
                        </p>
                        {!showManualModal && (
                            <div className="flex gap-3 max-w-xs mx-auto mt-4">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-11 text-slate-600"
                                    onClick={() => setCurrentStep(1)}
                                >
                                    <ChevronLeft className="mr-1 h-4 w-4" /> 이전
                                </Button>
                                <Button
                                    className="flex-1 bg-letus-orange hover:bg-letus-orange/90 text-white font-bold h-11"
                                    onClick={() => setCurrentStep(ocrResults.some(r => ["운전면허증", "자동차등록증"].includes(r.docType)) ? 3 : 4)}
                                >
                                    다음 <ArrowRight className="ml-1 h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== Step 3: 시공팀 정보 입력 ===== */}
                {currentStep === 3 && (
                    <>
                        {/* Tabs */}
                        <div className="flex bg-white rounded-xl shadow-sm border overflow-hidden">
                            <button
                                className={`flex-1 flex items-center justify-center gap-2 p-3.5 text-sm font-bold transition-colors ${
                                    activeInfoTab === "personal" ? "bg-letus-orange text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                                onClick={() => setActiveInfoTab("personal")}
                            >
                                <User className="w-4 h-4" /> 개인정보
                            </button>
                            <button
                                className={`flex-1 flex items-center justify-center gap-2 p-3.5 text-sm font-bold transition-colors ${
                                    activeInfoTab === "vehicle" ? "bg-letus-orange text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                                onClick={() => setActiveInfoTab("vehicle")}
                            >
                                <Truck className="w-4 h-4" /> 차량정보
                            </button>
                        </div>

                        {/* Personal Info */}
                        {activeInfoTab === "personal" && (
                            <Card className="border-2 border-letus-orange/20 shadow-md">
                                <CardContent className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 mb-1 block">이름 <span className="text-red-500">*</span></label>
                                            <Input value={personal.name} onChange={e => setPersonal(p => ({ ...p, name: e.target.value }))} placeholder="홍길동" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 mb-1 block">생년월일 (6자리) <span className="text-red-500">*</span></label>
                                            <Input value={personal.birthday} onChange={e => setPersonal(p => ({ ...p, birthday: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="901215" maxLength={6} inputMode="numeric" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">연락처 <span className="text-red-500">*</span></label>
                                        <Input value={personal.phone} onChange={e => setPersonal(p => ({ ...p, phone: e.target.value.replace(/\D/g, "") }))} placeholder="01012345678" inputMode="numeric" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">이메일 <span className="text-red-500">*</span></label>
                                        <Input type="email" value={personal.email} onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))} placeholder="example@email.com" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">주소 <span className="text-red-500">*</span></label>
                                        <Input value={personal.address} onChange={e => setPersonal(p => ({ ...p, address: e.target.value }))} placeholder="도로명 주소 입력" />
                                    </div>
                                    <div className="flex gap-3">
                                        <Button variant="outline" className="w-1/3 h-12 text-slate-600" onClick={() => setCurrentStep(1)} disabled={isSubmitting}>
                                            <ChevronLeft className="mr-1 h-4 w-4" /> 이전
                                        </Button>
                                        <Button className="flex-1 h-12 text-base font-bold bg-letus-orange hover:bg-letus-orange/90 text-white shadow-lg" onClick={handlePersonalSubmit} disabled={isSubmitting}>
                                            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 등록 중...</> : "개인정보 등록"}
                                        </Button>
                                    </div>
                                    <p className="text-center text-[11px] text-slate-400">* 차량정보는 나중에 별도로 등록할 수 있습니다.</p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Vehicle Info */}
                        {activeInfoTab === "vehicle" && (
                            <Card className="border-2 border-letus-orange/20 shadow-md">
                                <CardContent className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 mb-1 block">차명 <span className="text-red-500">*</span></label>
                                            <Input placeholder="예: 포터2" value={vehicle.vehicleName} onChange={e => setVehicle(v => ({ ...v, vehicleName: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 mb-1 block">차량번호 <span className="text-red-500">*</span></label>
                                            <Input placeholder="예: 12가 3456" value={vehicle.licensePlate} onChange={e => setVehicle(v => ({ ...v, licensePlate: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">연료 <span className="text-red-500">*</span></label>
                                        <select className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm" value={vehicle.fuelType} onChange={e => setVehicle(v => ({ ...v, fuelType: e.target.value }))}>
                                            <option value="">선택</option>
                                            <option value="경유">경유</option><option value="휘발유">휘발유</option><option value="전기">전기</option><option value="LPG">LPG</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">차량형태 <span className="text-red-500">*</span></label>
                                        <select className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm" value={vehicle.vehicleType} onChange={e => setVehicle(v => ({ ...v, vehicleType: e.target.value }))}>
                                            <option value="">선택</option>
                                            <option value="밴형">밴형</option><option value="탑형">탑형</option><option value="오픈배드형">오픈배드형</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">번호판 구분 <span className="text-red-500">*</span></label>
                                        <select className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm" value={vehicle.plateType} onChange={e => setVehicle(v => ({ ...v, plateType: e.target.value }))}>
                                            <option value="">선택</option>
                                            <option value="일반번호판">일반번호판</option><option value="'배'번호판">&apos;배&apos;번호판</option><option value="영업용번호판">영업용번호판</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">번호판 종류(용도) <span className="text-red-500">*</span></label>
                                        <select className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm" value={vehicle.platePurpose} onChange={e => setVehicle(v => ({ ...v, platePurpose: e.target.value }))}>
                                            <option value="">선택</option>
                                            <option value="자가용">자가용</option><option value="영업용">영업용</option><option value="관용">관용</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">CO2 배출량 (g/km) <span className="text-red-500">*</span></label>
                                        <Input placeholder="숫자 입력" value={vehicle.co2Emission} onChange={e => setVehicle(v => ({ ...v, co2Emission: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-1 block">적재함형태/적재량 <span className="text-red-500">*</span></label>
                                        <Input placeholder="예: 내장탑/1000kg" value={vehicle.loadingCapacity} onChange={e => setVehicle(v => ({ ...v, loadingCapacity: e.target.value }))} />
                                    </div>
                                    <div className="flex gap-3">
                                        <Button variant="outline" className="w-1/3 h-12 text-slate-600" onClick={() => setActiveInfoTab("personal")} disabled={isSubmitting}>
                                            <ChevronLeft className="mr-1 h-4 w-4" /> 이전
                                        </Button>
                                        <Button className="flex-1 h-12 text-base font-bold bg-letus-orange hover:bg-letus-orange/90 text-white shadow-lg" onClick={handleVehicleSubmit} disabled={isSubmitting}>
                                            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 등록 중...</> : "차량정보 등록 및 완료"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* 차량 건너뛰기 */}
                        <button
                            className="w-full text-center text-xs text-slate-400 hover:text-letus-orange hover:underline transition-colors py-2"
                            onClick={() => setCurrentStep(4)}
                        >
                            차량정보 없이 완료하기 →
                        </button>
                    </>
                )}

                {/* ===== Step 4: 완료 ===== */}
                {currentStep === 4 && (
                    <div className="text-center space-y-6 py-12">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800">등록 완료!</h2>
                        <p className="text-sm text-slate-500">
                            서류 및 시공팀 정보가 성공적으로 등록되었습니다.
                            <br />제출된 데이터는 구글 스프레드시트에 안전하게 보관됩니다.
                        </p>
                        <div className="flex gap-3 max-w-sm mx-auto flex-wrap justify-center mt-6">
                            <Button variant="outline" className="flex-1 h-11 text-slate-600" onClick={() => setCurrentStep(3)}>
                                <ChevronLeft className="mr-1 h-4 w-4" /> 이전
                            </Button>
                            <Button variant="outline" className="flex-1 h-11" onClick={() => { setCurrentStep(1); fetchData(); }}>
                                추가 서류 업로드
                            </Button>
                            <Button className="w-full h-11 bg-letus-orange hover:bg-letus-orange/90 text-white font-bold" onClick={() => router.push("/")}>
                                메인으로
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Manual Input Modal (반려 시에만 활성화) */}
            {showManualModal && rejectedItems[currentFallbackIdx] && (
                <ManualInputModal
                    isOpen={showManualModal}
                    onClose={handleSkipFallback}
                    onSubmit={handleManualSubmit}
                    docType={rejectedItems[currentFallbackIdx].docType}
                    fileId={rejectedItems[currentFallbackIdx].fileId}
                    ocrExtractedData={rejectedItems[currentFallbackIdx].extractedData}
                    extractionStatus={rejectedItems[currentFallbackIdx].extractionStatus}
                    fileName={rejectedItems[currentFallbackIdx].fileName}
                />
            )}
        </div>
    );
}

export default function UnifiedDashboard() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <UnifiedDashboardContent />
        </Suspense>
    );
}
