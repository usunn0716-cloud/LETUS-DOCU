"use client";

import { useState, useRef } from "react";
import {
    Upload,
    FileText,
    X,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitDocument } from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import { processUploadImage } from "@/lib/imageProcessor";

interface BulkFile {
    file: File;
    preview: string;
    status: "pending" | "scanning" | "classified" | "error" | "saving" | "done";
    id: string;
    result?: any;
    itemId?: string;
    error?: string;
}

interface BulkUploadZoneProps {
    userId: string;
    userName: string;
    userPhone: string;
    region: string;
    subRegion: string;
    role: "manager" | "driver";
    onComplete: () => void;
}

// 서류명 -> ItemId 매핑 (manager/driver 구분)
// AI가 반환하는 다양한 document_type 변형에 대응하기 위해 동일 서류에 여러 키를 등록
const ITEM_MAP: Record<string, { manager: string; driver: string }> = {
    "사업자등록증": { manager: "m1", driver: "c2" },
    "사업자등록증명원": { manager: "m1", driver: "c2" },
    "위수탁계약서": { manager: "m2", driver: "c1" },
    "위·수탁 계약서": { manager: "m2", driver: "c1" },
    "위수탁 계약서": { manager: "m2", driver: "c1" },
    "부속합의서": { manager: "m2", driver: "c1" },
    "합의서": { manager: "m2", driver: "c1" },
    "사무실 임대(전대)차계약서": { manager: "m3", driver: "" },
    "임대차계약서": { manager: "m3", driver: "" },
    "전대차계약서": { manager: "m3", driver: "" },
    "부동산전대차계약서": { manager: "m3", driver: "" },
    "사무실 전대차 동의서": { manager: "m4", driver: "" },
    "전대차 동의서": { manager: "m4", driver: "" },
    "사용 승낙서": { manager: "m4", driver: "" },
    "영업소 등기부등본": { manager: "m5", driver: "" },
    "등기부등본": { manager: "m5", driver: "" },
    "등기사항전부증명서": { manager: "m5", driver: "" },
    "등기사항일부증명서": { manager: "m5", driver: "" },
    "산재보험가입증명원": { manager: "m6", driver: "c3" },
    "보험가입증명원": { manager: "m6", driver: "c3" },
    "자동차등록증": { manager: "m7", driver: "c5" },
    "화물운송종사 자격증": { manager: "m8", driver: "c6" },
    "화물운송 종사자격증": { manager: "m8", driver: "c6" },
    "화물운송종사자격증": { manager: "m8", driver: "c6" },
    "화물운송 종사 자격증": { manager: "m8", driver: "c6" },
    "운전면허증": { manager: "m9", driver: "c7" },
    "자동차운전면허증": { manager: "m9", driver: "c7" },
    "안전교육 이수증": { manager: "m10", driver: "c4" },
    "교육 실시확인서": { manager: "m10", driver: "c4" },
    "안전교육이수증": { manager: "m10", driver: "c4" },
    "화물운송 허가증": { manager: "m11", driver: "c8" },
    "화물자동차 운송사업 허가증": { manager: "m11", driver: "c8" },
    "화물운송허가증": { manager: "m11", driver: "c8" },
    "택배기사 명부": { manager: "m12", driver: "" },
    "영업소 전경 사진": { manager: "m13", driver: "" },
};

export default function BulkUploadZone({
    userId, userName, userPhone, region, subRegion, role, onComplete
}: BulkUploadZoneProps) {
    const [files, setFiles] = useState<BulkFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessingFiles, setIsProcessingFiles] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addFiles(Array.from(e.target.files));
        }
    };

    const addFiles = async (newFiles: File[]) => {
        setIsProcessingFiles(true);
        try {
            const processedFiles: BulkFile[] = [];
            for (const f of newFiles) {
                const processed = await processUploadImage(f);
                processedFiles.push({
                    file: processed,
                    preview: URL.createObjectURL(processed),
                    status: "pending" as const,
                    id: Math.random().toString(36).substring(7),
                });
            }
            setFiles(prev => [...prev, ...processedFiles]);
        } catch (error) {
            console.error("일괄 업로드 파일 처리 실패:", error);
            alert("일부 사진 준비 중 오류가 발생했습니다.");
        } finally {
            setIsProcessingFiles(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) {
            addFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const updateFileStatus = (id: string, status: BulkFile["status"], extra: Partial<BulkFile> = {}) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status, ...extra } : f));
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onload = (e) => resolve(e.target?.result as string);
            r.readAsDataURL(file);
        });
    };

    // ==============================
    // 1단계: AI 일괄 분류 + 검증
    // ==============================
    const startBulkProcess = async () => {
        const pendingFiles = files.filter(f => f.status === "pending" || f.status === "error");

        for (const f of pendingFiles) {
            updateFileStatus(f.id, "scanning");
            try {
                const base64 = await fileToBase64(f.file);

                // 기존 verify-document API를 Auto-Detection 모드로 호출
                // (itemId/docTitle 생략 → AI가 스스로 분류)
                const response = await fetch("/api/verify-document", {
                    method: "POST",
                    body: JSON.stringify({
                        imageBase64: base64,
                        fileType: f.file.type,
                        userName,
                        userPhone,
                        userSubRegion: subRegion,
                    }),
                });
                const aiResult = await response.json();

                if (!response.ok || aiResult.error) {
                    throw new Error(aiResult.error || "AI 분석 실패");
                }

                // ITEM_MAP으로 역할에 맞는 itemId 매핑
                const docType = aiResult.document_type;
                const mapping = ITEM_MAP[docType];
                const itemId = role === "manager" ? mapping?.manager : mapping?.driver;

                if (!itemId) {
                    updateFileStatus(f.id, "error", {
                        error: mapping
                            ? `이 역할(${role === "manager" ? "영업소장" : "택배기사"})에는 해당 서류 칸이 없습니다: ${docType}`
                            : `인식 불가한 서류입니다: ${docType || "알 수 없음"}`
                    });
                    continue;
                }

                updateFileStatus(f.id, "classified", { result: aiResult, itemId });
            } catch (err: any) {
                updateFileStatus(f.id, "error", { error: err.message || "분류 실패" });
            }
        }
    };

    // ==============================
    // 2단계: 적합 서류 자동 배치 + Firebase 저장
    // ==============================
    const submitAllValid = async () => {
        // 적합 + 반려 모두 처리 (반려는 pending으로 저장)
        const classifiedFiles = files.filter(f => f.status === "classified" && f.itemId);
        if (classifiedFiles.length === 0) return;

        for (const f of classifiedFiles) {
            updateFileStatus(f.id, "saving");
            try {
                // 1) Firebase Storage 업로드 → fileUrl 획득
                const { fileUrl } = await uploadDocumentFile(
                    f.file,
                    subRegion,
                    userName,
                    f.result.document_type
                );

                const isRejected = f.result?.overall_result === "반려";

                // 2) Firestore 저장 (반려 서류는 pending으로 저장하여 관리자 수동 심사 대기)
                const isSecondFile = f.result.document_type === "부속합의서";
                await submitDocument({
                    userId,
                    userName,
                    userPhone,
                    userRegion: region,
                    userSubRegion: subRegion,
                    userRole: role,
                    itemId: f.itemId!,
                    title: f.result.document_type,
                    fileUrl,
                    fileName: f.file.name,
                    verificationResult: f.result,
                    ...(isSecondFile ? {
                        fileUrl2: fileUrl,
                        fileName2: f.file.name,
                        verificationResult2: f.result,
                    } : {}),
                }, isRejected ? "pending" : "submitted");

                updateFileStatus(f.id, "done");
            } catch (err: any) {
                updateFileStatus(f.id, "error", { error: "저장 실패: " + (err.message || "") });
            }
        }
        onComplete();
    };

    const hasClassified = files.some(f => f.status === "classified" || f.status === "done");
    const isProcessing = files.some(f => f.status === "scanning" || f.status === "saving");
    const validCount = files.filter(f => f.status === "classified" && f.result?.overall_result === "적합").length;
    const rejectedCount = files.filter(f => f.status === "classified" && f.result?.overall_result === "반려").length;

    return (
        <Card className="border-2 border-dashed border-letus-orange/30 bg-gradient-to-br from-white to-orange-50/30 overflow-hidden shadow-sm">
            <CardContent className="p-6">
                {!files.length ? (
                    /* ==================== 초기 상태: Drag & Drop 영역 ==================== */
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`py-14 flex flex-col items-center justify-center cursor-pointer transition-all rounded-xl border-2 border-dashed ${isDragging
                            ? "bg-letus-orange/10 border-letus-orange scale-[1.01]"
                            : "border-transparent hover:bg-slate-50/80"
                            }`}
                    >
                        <div className={`p-4 rounded-full mb-4 transition-all ${isDragging ? "bg-letus-orange/20" : "bg-slate-100"}`}>
                            <Upload className={`h-10 w-10 transition-all ${isDragging ? "text-letus-orange scale-110" : "text-slate-300"}`} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">📂 서류 일괄 업로드</h3>
                        <p className="text-sm text-slate-400 mt-1 text-center">
                            여러 장의 서류를 한 번에 끌어다 놓거나 클릭하여 선택하세요.<br />
                            <span className="text-letus-orange font-medium">AI가 자동으로 분류하고 적합 여부를 판정</span>합니다.
                        </p>
                        {isProcessingFiles && (
                            <div className="absolute inset-0 bg-white/80 rounded-xl flex flex-col items-center justify-center z-10 transition-all">
                                <div className="h-10 w-10 border-4 border-letus-orange border-t-transparent rounded-full animate-spin mb-4"></div>
                                <h3 className="text-lg font-bold text-slate-700">사진 최적화 중...</h3>
                                <p className="text-sm text-slate-500 mt-1">방향 보정 및 용량을 줄이고 있습니다.</p>
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            multiple
                            accept="image/jpeg, image/png, image/heic, image/heif, application/pdf"
                            onChange={handleFileSelect}
                            disabled={isProcessingFiles}
                        />
                    </div>
                ) : (
                    /* ==================== 파일 선택 후: 목록 + 액션 ==================== */
                    <div className="space-y-4">
                        {/* 헤더 */}
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2 text-slate-700">
                                <FileText className="h-4 w-4 text-letus-orange" />
                                업로드 파일 ({files.length}개)
                                {validCount > 0 && <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">적합 {validCount}</span>}
                                {rejectedCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">반려 {rejectedCount}</span>}
                            </h3>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setFiles([])} disabled={isProcessing} className="text-slate-400 hover:text-red-500">
                                    모두 삭제
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                                    + 파일 추가
                                </Button>
                                <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleFileSelect} />
                            </div>
                        </div>

                        {/* 파일 목록 */}
                        <div className="grid gap-2 max-h-80 overflow-y-auto pr-1">
                            {files.map(f => (
                                <div key={f.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${f.status === "done" ? "bg-green-50 border-green-200" :
                                    f.status === "error" ? "bg-red-50 border-red-200" :
                                        f.status === "classified" && f.result?.overall_result === "반려" ? "bg-red-50/50 border-red-100" :
                                            "bg-white border-slate-100 hover:border-slate-200"
                                    }`}>
                                    {/* 미리보기 */}
                                    <div className="h-11 w-11 rounded-md overflow-hidden bg-slate-100 flex-shrink-0 border">
                                        <img src={f.preview} alt="" className="h-full w-full object-cover" />
                                    </div>

                                    {/* 정보 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold truncate text-slate-700">{f.file.name}</span>
                                            {f.status === "scanning" && <Loader2 className="h-3 w-3 animate-spin text-letus-orange flex-shrink-0" />}
                                            {f.status === "classified" && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${f.result.overall_result === "적합" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                                                    }`}>
                                                    {f.result.document_type} · {f.result.overall_result}
                                                </span>
                                            )}
                                            {f.status === "done" && (
                                                <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                                                    ✓ 배치 완료
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs mt-0.5 truncate">
                                            {f.status === "pending" && <span className="text-slate-400">대기 중</span>}
                                            {f.status === "scanning" && <span className="text-letus-orange">AI가 서류를 분석하고 있습니다...</span>}
                                            {f.status === "saving" && <span className="text-blue-500">Firebase에 저장 중...</span>}
                                            {f.status === "error" && <span className="text-red-500 font-medium">⚠️ {f.error}</span>}
                                            {f.status === "classified" && f.result?.overall_result === "반려" && (
                                                <span className="text-red-400">이 서류는 다시 확인해 주세요: {f.result.rejection_reasons?.[0]}</span>
                                            )}
                                            {f.status === "classified" && f.result?.overall_result === "적합" && (
                                                <span className="text-green-600">→ <b>{f.result.document_type}</b> 칸에 자동 배치됩니다</span>
                                            )}
                                            {f.status === "done" && <span className="text-green-600">저장 완료!</span>}
                                        </p>
                                    </div>

                                    {/* 삭제/상태 아이콘 */}
                                    <div className="flex-shrink-0">
                                        {(f.status === "pending" || f.status === "error") ? (
                                            <button onClick={() => removeFile(f.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                                <X className="h-4 w-4" />
                                            </button>
                                        ) : f.status === "done" ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        ) : f.status === "saving" ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 액션 버튼 */}
                        <div className="pt-2 flex gap-3">
                            {!hasClassified ? (
                                <Button
                                    className="flex-1 bg-letus-orange hover:bg-letus-orange/90 h-12 text-base font-bold shadow-lg shadow-orange-100"
                                    onClick={startBulkProcess}
                                    disabled={isProcessing || files.filter(f => f.status === "pending").length === 0}
                                >
                                    {isProcessing
                                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> AI 분석 중...</>
                                        : <><Search className="h-4 w-4 mr-2" /> 🤖 일괄 AI 분석 시작</>
                                    }
                                </Button>
                            ) : (
                                <Button
                                    className={`flex-1 h-12 text-base font-bold transition-all ${validCount > 0
                                        ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100"
                                        : "bg-slate-300 cursor-not-allowed"
                                        }`}
                                    onClick={submitAllValid}
                                    disabled={isProcessing || (validCount === 0 && rejectedCount === 0)}
                                >
                                    {isProcessing
                                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 저장 중...</>
                                        : <><CheckCircle2 className="h-4 w-4 mr-2" /> 적합 {validCount}건{rejectedCount > 0 ? ` + 심사대기 ${rejectedCount}건` : ""} 제출</>
                                    }
                                </Button>
                            )}
                        </div>

                        {/* 반려 안내 */}
                        {rejectedCount > 0 && (
                            <p className="text-xs text-center text-yellow-600 font-medium flex items-center justify-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                반려된 서류 {rejectedCount}건은 관리자 확인을 위해 접수됩니다. (수동 심사 대기)
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
