"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import {
    ChevronLeft,
    Camera,
    File as FileIcon,
    FileText,
    CheckCircle2,
    Check,
    RefreshCw,
    X,
    Plus,
    Trash2,
    AlertCircle,
    Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadDocumentFile, deleteDocumentFile } from "@/lib/storage";
import { submitDocument, cancelDocument, getUserDocuments } from "@/lib/firestore";
import { DOCUMENT_DESCRIPTIONS } from "@/app/data/mock";
import { processUploadImage } from "@/lib/imageProcessor";

// 쌍따옴표 안의 텍스트를 볼드+주황색으로 렌더링하는 헬퍼
function renderDescriptionText(text: string) {
    const parts = text.split(/"([^"]+)"/g);
    return parts.map((part, i) => {
        if (i % 2 === 1) {
            return <span key={i} className="font-bold text-letus-orange">{part}</span>;
        }
        return <span key={i}>{part}</span>;
    });
}

// 2파일 업로드 대상 itemId
const MULTI_FILE_IDS: string[] = [];
const MULTI_FILE_LABELS: string[] = [];

// 갤러리(무제한 다중 파일) 업로드 대상
const GALLERY_IDS = ["m13"];

interface FileSlot {
    file: File | null;
    img: string | null;
    fileType: string | null;
    fileName: string;
    verificationResult: any;
    status: "empty" | "selected" | "verified" | "rejected";
    savedUrl?: string; // Firebase에 저장된 URL (적합 통과 후)
}

function UploadPageContent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const itemId = params.itemId as string;
    const userId = searchParams.get("userId") || "";
    const name = searchParams.get("name") || "";
    const phone = searchParams.get("phone") || "";
    const birthday = searchParams.get("birthday") || "";
    const region = searchParams.get("region") || "";
    const subRegion = searchParams.get("subRegion") || "";
    const role = searchParams.get("role") || "manager";
    const docTitle = searchParams.get("docTitle") || "서류";

    const isMultiFile = MULTI_FILE_IDS.includes(itemId);
    const isGallery = GALLERY_IDS.includes(itemId);

    // === 단일 파일 상태 (기존) ===
    const [step, setStep] = useState<"upload" | "verify" | "submitting" | "complete" | "reviewing">("upload");
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [img, setImg] = useState<string | null>(null);
    const [fileType, setFileType] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<any>(null);
    const [existingDocId, setExistingDocId] = useState<string | null>(null);
    const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
    const [existingRejectionCount, setExistingRejectionCount] = useState<number>(0);
    const fileInput = useRef<HTMLInputElement>(null);

    // === 다중 파일 상태 (위수탁계약서 + 부속합의서) ===
    const [slots, setSlots] = useState<FileSlot[]>([
        { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" },
        { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" },
    ]);
    const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
    const [multiSubmitting, setMultiSubmitting] = useState(false);
    const [multiVerifyingIndex, setMultiVerifyingIndex] = useState<number | null>(null);
    const slotFileInput = useRef<HTMLInputElement>(null);

    // === 갤러리 모드 상태 (영업소 전경 사진 등) ===
    const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
    const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
    const [existingGalleryUrls, setExistingGalleryUrls] = useState<string[]>([]);
    const [gallerySubmitting, setGallerySubmitting] = useState(false);
    const galleryFileInput = useRef<HTMLInputElement>(null);

    // 갤러리: 파일 추가
    const handleGalleryAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawFiles = Array.from(e.target.files || []);
        if (rawFiles.length === 0) return;

        setIsProcessingFile(true);
        try {
            const processedFiles: File[] = [];
            for (const f of rawFiles) {
                const processed = await processUploadImage(f);
                processedFiles.push(processed);
            }

            setGalleryFiles(prev => [...prev, ...processedFiles]);
            // 미리보기 생성
            processedFiles.forEach((f: File) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setGalleryPreviews(prev => [...prev, ev.target?.result as string]);
                };
                reader.readAsDataURL(f);
            });
        } catch (error) {
            console.error("갤러리 이미지 처리 실패:", error);
            alert("일부 사진 처리 중 오류가 발생했습니다.");
        } finally {
            setIsProcessingFile(false);
        }
    };

    // 갤러리: 파일 삭제
    const handleGalleryRemove = (index: number) => {
        setGalleryFiles(prev => prev.filter((_, i) => i !== index));
        setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
    };

    // 갤러리: 제출
    const handleGallerySubmit = async () => {
        if (galleryFiles.length === 0 || !userId) return;
        setGallerySubmitting(true);
        try {
            const uploadedUrls: string[] = [];
            const uploadedNames: string[] = [];
            for (const file of galleryFiles) {
                const { fileUrl, fileName: uploadedName } = await uploadDocumentFile(file, subRegion, name, docTitle);
                uploadedUrls.push(fileUrl);
                uploadedNames.push(uploadedName);
            }

            await submitDocument({
                userId, userName: name, userPhone: phone, userRegion: region,
                userSubRegion: subRegion, userRole: role, itemId, title: docTitle,
                fileUrl: uploadedUrls[0],
                fileName: uploadedNames[0],
                fileUrls: uploadedUrls,
                fileNames: uploadedNames,
            });

            setExistingGalleryUrls(uploadedUrls);
            setStep("complete");
            alert(`${docTitle} ${uploadedUrls.length}장이 성공적으로 제출되었습니다.`);
        } catch (error) {
            console.error("갤러리 제출 실패:", error);
            alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setGallerySubmitting(false);
        }
    };

    // 기존 제출 확인
    useEffect(() => {
        async function checkExisting() {
            if (!userId) return;
            try {
                const docs = await getUserDocuments(userId);
                const existing = docs.find(d => d.itemId === itemId);
                if (existing && (existing.status === "submitted" || existing.status === "approved" || existing.status === "hq_review")) {
                    setExistingDocId(existing.id!);
                    setExistingFileUrl(existing.fileUrl || null);
                    setExistingRejectionCount(existing.rejectionCount || 0);
                    setStep("complete");
                    setFileName(existing.fileName || "");
                    if (existing.verificationResult) {
                        setVerificationResult(existing.verificationResult);
                    }
                    // 다중 파일: 기존 데이터 복원
                    if (isMultiFile) {
                        const newSlots = [...slots];
                        if (existing.fileUrl) {
                            newSlots[0] = { ...newSlots[0], fileName: existing.fileName || "", status: "verified", savedUrl: existing.fileUrl, verificationResult: existing.verificationResult };
                        }
                        if ((existing as any).fileUrl2) {
                            newSlots[1] = { ...newSlots[1], fileName: (existing as any).fileName2 || "", status: "verified", savedUrl: (existing as any).fileUrl2, verificationResult: (existing as any).verificationResult2 };
                        }
                        setSlots(newSlots);
                    }
                    // 갤러리: 기존 다중 URL 복원
                    if (isGallery && (existing as any).fileUrls) {
                        setExistingGalleryUrls((existing as any).fileUrls);
                    }
                } else if (existing && (existing.status === "pending" || existing.status === "rejected" || existing.status === "hq_review") && existing.fileUrl) {
                    // pending (OCR 부적격 → 관리자 심사 대기) 또는 rejected (반려) 서류
                    setExistingDocId(existing.id!);
                    setExistingFileUrl(existing.fileUrl || null);
                    setExistingRejectionCount(existing.rejectionCount || 0);
                    setFileName(existing.fileName || "");
                    if (existing.verificationResult) {
                        setVerificationResult(existing.verificationResult);
                    }

                    // 다중 파일: 반려 상태 복원
                    if (isMultiFile) {
                        const newSlots = [...slots];
                        if (existing.fileUrl) {
                            newSlots[0] = { ...newSlots[0], fileName: existing.fileName || "", status: existing.status === "rejected" ? "rejected" : "verified", savedUrl: existing.fileUrl, verificationResult: existing.verificationResult };
                        }
                        if ((existing as any).fileUrl2) {
                            newSlots[1] = { ...newSlots[1], fileName: (existing as any).fileName2 || "", status: existing.status === "rejected" ? "rejected" : "verified", savedUrl: (existing as any).fileUrl2, verificationResult: (existing as any).verificationResult2 };
                        }
                        // 관리자가 수동 반려 시 overall_result 덮어쓰기 (화면 표시용)
                        if (existing.status === "rejected") {
                            newSlots[0].verificationResult = { ...newSlots[0].verificationResult, overall_result: "반려", rejection_reasons: existing.rejectionReason ? [existing.rejectionReason] : [] };
                            if ((existing as any).fileUrl2) {
                                newSlots[1].verificationResult = { ...newSlots[1].verificationResult, overall_result: "반려", rejection_reasons: existing.rejectionReason ? [existing.rejectionReason] : [] };
                            }
                        }
                        setSlots(newSlots);
                    }

                    // 단일 파일 반려 사유 덮어쓰기
                    if (existing.status === "rejected") {
                        setVerificationResult((prev: any) => ({
                            ...prev,
                            overall_result: "반려",
                            rejection_reasons: existing.rejectionReason ? [existing.rejectionReason] : prev?.rejection_reasons || []
                        }));
                    }
                    setStep("reviewing");
                }
            } catch (error) {
                console.error("기존 문서 확인 실패:", error);
            }
        }
        checkExisting();
    }, [userId, itemId]);

    // =============================================
    // 단일 파일 핸들러 (기존 로직)
    // =============================================
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawFile = e.target.files?.[0];
        if (rawFile) {
            setIsProcessingFile(true);
            try {
                // HEIC 변환 및 EXIF 자동 회전/압축
                const f = await processUploadImage(rawFile);

                setSelectedFile(f);
                setFileType(f.type);
                setFileName(f.name);
                const r = new FileReader();
                r.onload = (ev) => {
                    setImg(ev.target?.result as string);
                    setStep("verify");
                    setIsProcessingFile(false);
                };
                r.readAsDataURL(f);
            } catch (error) {
                console.error("파일 처리 실패:", error);
                alert("파일을 처리하는 중 오류가 발생했습니다. 다른 사진을 선택해주세요.");
                setIsProcessingFile(false);
            }
        }
    };

    const handleFinalSubmit = async () => {
        if (!selectedFile || !userId) return;

        setIsSubmitting(true);
        setStep("submitting");
        try {
            const targetIds = [
                "m1", "m2", "m2b", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12",
                "c1", "c1b", "c2", "c3", "c4", "c5", "c6", "c7", "c8"
            ];

            let aiResult = null;
            let isOcrRejected = false;
            if (targetIds.includes(itemId)) {
                setIsVerifying(true);
                try {
                    const response = await fetch("/api/verify-document", {
                        method: "POST",
                        body: JSON.stringify({
                            imageBase64: img,
                            fileType,
                            itemId,
                            docTitle,
                            userName: name,
                            userPhone: phone,
                            userSubRegion: subRegion,
                            userBirthday: birthday,
                            userRegion: region,
                            role: role
                        }),
                    });
                    aiResult = await response.json();
                    if (!response.ok || aiResult.error) {
                        alert(`AI 스캔 중 문제가 발생했습니다: ${aiResult.error || "서버 오류"}`);
                        setIsSubmitting(false);
                        setIsVerifying(false);
                        setStep("verify");
                        return;
                    }
                    setVerificationResult(aiResult);

                    if (aiResult?.overall_result === "반려") {
                        isOcrRejected = true;
                    }
                } catch (err) {
                    console.error("AI 점검 실패:", err);
                    alert("AI 서버와 연결할 수 없습니다.");
                    setIsSubmitting(false);
                    setIsVerifying(false);
                    setStep("verify");
                    return;
                } finally {
                    setIsVerifying(false);
                }
            }

            const { fileUrl, fileName: uploadedFileName } = await uploadDocumentFile(
                selectedFile, subRegion, name, docTitle
            );

            // 셏프 코렉션 (세진 수정): 기존 반려 이력 + OCR 통과 → 대기열 없이 바로 승인
            const isSelfCorrection = existingRejectionCount > 0 && !isOcrRejected;
            const finalStatusOverride = isOcrRejected
                ? (role === "manager" ? "hq_review" : "pending")
                : (isSelfCorrection ? "approved" : "submitted");

            const docId = await submitDocument({
                userId, userName: name, userPhone: phone, userRegion: region,
                userSubRegion: subRegion, userRole: role, itemId, title: docTitle,
                fileUrl, fileName: uploadedFileName, verificationResult: aiResult,
            }, finalStatusOverride, isOcrRejected ? 1 : 0);

            // 구글 시트에 서류 링크 기록 (시트-플랫폼 동기화)
            fetch("/api/construction-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "updateDocumentLinks",
                    name: name,
                    birthday: birthday,
                    phone: phone,
                    docType: docTitle,
                    fileUrl,
                    center: region,
                    subRegion: subRegion,
                    role: role,
                }),
            }).catch(e => console.error("[IndividualUpload] 서류 링크 시트 기록 실패:", e));

            setExistingDocId(docId);
            setExistingFileUrl(fileUrl);
            setStep("complete");

            if (isOcrRejected) {
                alert("서류가 접수되었습니다. 일부 내용이 명확하지 않아 관리자가 확인 중입니다.");
            } else if (isSelfCorrection) {
                alert("✅ 서류가 성공적으로 제출되었습니다. (AI 통과)");
            } else {
                alert("서류가 성공적으로 제출되었습니다.");
            }
        } catch (error) {
            console.error("제출 실패:", error);
            alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            setStep("verify");
        } finally {
            setIsSubmitting(false);
            setIsVerifying(false);
        }
    };

    const handleCancel = async () => {
        if (!existingDocId || !userId) return;
        if (!confirm("제출을 취소하시겠습니까?")) return;
        try {
            if (existingFileUrl) await deleteDocumentFile(existingFileUrl);
            await cancelDocument(existingDocId);

            // 구글 스프레드시트에서도 해당 행 삭제 (플랫폼-시트 동기화)
            fetch("/api/delete-sheet-row", {
                method: "POST",
                body: JSON.stringify({ itemId, userName: name, userPhone: phone }),
            }).catch(e => console.error("시트 행 삭제 실패:", e));

            setExistingDocId(null);
            setExistingFileUrl(null);
            setImg(null);
            setSelectedFile(null);
            setFileName("");
            setVerificationResult(null);
            setStep("upload");
            if (isMultiFile) {
                setSlots([
                    { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" },
                    { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" },
                ]);
            }
            alert("제출이 취소되었습니다.");
        } catch (error) {
            console.error("취소 실패:", error);
            alert("취소 중 오류가 발생했습니다.");
        }
    };

    const handleRetryUpload = () => {
        setVerificationResult(null);
        setImg(null);
        setSelectedFile(null);
        setFileName("");
        setStep("upload");
    };

    // =============================================
    // 다중 파일 핸들러 (위수탁계약서 + 부속합의서)
    // =============================================
    const handleSlotFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;

        setIsProcessingFile(true);
        try {
            const f = await processUploadImage(rawFile);

            const idx = activeSlotIndex;
            const r = new FileReader();
            r.onload = (ev) => {
                const newSlots = [...slots];
                newSlots[idx] = {
                    file: f,
                    img: ev.target?.result as string,
                    fileType: f.type,
                    fileName: f.name,
                    verificationResult: null,
                    status: "selected",
                };
                setSlots(newSlots);
                setIsProcessingFile(false);
            };
            r.readAsDataURL(f);
        } catch (error) {
            console.error("슬롯 파일 처리 실패:", error);
            alert("파일을 처리하는 중 오류가 발생했습니다. 다른 사진을 선택해주세요.");
            setIsProcessingFile(false);
        }
    };

    const removeSlotFile = (idx: number) => {
        const newSlots = [...slots];
        newSlots[idx] = { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" };
        setSlots(newSlots);
    };

    const handleMultiSubmit = async () => {
        if (!userId) return;

        // 적어도 1개는 선택되어야 함
        const hasAnyFile = slots.some(s => s.file !== null);
        if (!hasAnyFile) {
            alert("최소 1개 이상의 파일을 선택해주세요.");
            return;
        }

        setMultiSubmitting(true);
        setStep("submitting");

        try {
            const newSlots = [...slots];
            let anyOcrRejected = false;
            let anyError = false;

            // 각 슬롯 개별 처리
            for (let i = 0; i < 2; i++) {
                const slot = newSlots[i];
                if (!slot.file) continue; // 이 슬롯에 파일 없으면 건너뛰기

                const label = MULTI_FILE_LABELS[i];

                // 1. AI 점검
                setMultiVerifyingIndex(i);
                try {
                    const response = await fetch("/api/verify-document", {
                        method: "POST",
                        body: JSON.stringify({
                            imageBase64: slot.img,
                            fileType: slot.fileType,
                            itemId,
                            docTitle: label, // "위수탁계약서" or "부속합의서"
                            userName: name,
                            userPhone: phone,
                            userSubRegion: subRegion
                        }),
                    });
                    const aiResult = await response.json();

                    if (!response.ok || aiResult.error) {
                        newSlots[i] = { ...slot, verificationResult: { error: aiResult.error || "서버 오류" }, status: "rejected" };
                        anyError = true;
                        continue;
                    }

                    newSlots[i] = { ...slot, verificationResult: aiResult };

                    if (aiResult.overall_result === "반려") {
                        // OCR 부적격이라도 파일은 Storage에 업로드
                        anyOcrRejected = true;
                    }

                    // 적합이든 부적합이든 Firebase Storage 업로드
                    const { fileUrl, fileName: uploadedFileName } = await uploadDocumentFile(
                        slot.file!, subRegion, name, label
                    );
                    newSlots[i] = {
                        ...newSlots[i],
                        status: aiResult.overall_result === "반려" ? "rejected" : "verified",
                        savedUrl: fileUrl,
                        fileName: uploadedFileName,
                    };
                } catch (err) {
                    console.error(`AI 점검 실패 (${label}):`, err);
                    newSlots[i] = { ...slot, verificationResult: { error: "AI 서버 연결 실패" }, status: "rejected" };
                    anyError = true;
                }
            }

            setMultiVerifyingIndex(null);
            setSlots(newSlots);

            // 3. Firestore에 저장 (업로드된 모든 파일)
            const slot0HasUrl = newSlots[0].savedUrl;
            const slot1HasUrl = newSlots[1].savedUrl;
            const allApproved = !anyOcrRejected && !anyError;
            // 셏프 코렉션: 기존 반려 이력 + OCR 전체 통과 → 바로 승인
            const isSelfCorrection = existingRejectionCount > 0 && allApproved;
            const statusToSave = anyOcrRejected
                ? (role === "manager" ? "hq_review" : "pending")
                : (isSelfCorrection ? "approved" : "submitted");

            // 모든 상태(적합/부적합)의 파일을 저장
            const hasAnyUploaded = slot0HasUrl || slot1HasUrl;

            if (hasAnyUploaded) {
                const docId = await submitDocument({
                    userId,
                    userName: name,
                    userPhone: phone,
                    userRegion: region,
                    userSubRegion: subRegion,
                    userRole: role,
                    itemId,
                    title: docTitle,
                    fileUrl: slot0HasUrl ? newSlots[0].savedUrl! : (slot1HasUrl ? newSlots[1].savedUrl! : ""),
                    fileName: slot0HasUrl ? newSlots[0].fileName : (slot1HasUrl ? newSlots[1].fileName : ""),
                    verificationResult: slot0HasUrl ? newSlots[0].verificationResult : newSlots[1].verificationResult,
                    fileUrl2: slot1HasUrl && slot0HasUrl ? newSlots[1].savedUrl! : undefined,
                    fileName2: slot1HasUrl && slot0HasUrl ? newSlots[1].fileName : undefined,
                    verificationResult2: slot1HasUrl && slot0HasUrl ? newSlots[1].verificationResult : undefined,
                }, statusToSave as "submitted" | "pending" | "approved" | "hq_review", anyOcrRejected ? 1 : 0);
                setExistingDocId(docId);
            }

            setStep("complete");

            if (allApproved && hasAnyUploaded && isSelfCorrection) {
                alert("✅ 마들 서류가 성공적으로 제출되었습니다. (AI 통과)");
            } else if (allApproved && hasAnyUploaded) {
                alert("모든 서류가 성공적으로 제출되었습니다.");
            } else if (anyOcrRejected) {
                alert("서류가 접수되었습니다. 일부 내용이 명확하지 않아 관리자가 확인 중입니다.");
            } else if (anyError) {
                alert("일부 서류에서 오류가 발생했습니다. 오류가 없는 서류만 저장되었습니다.");
            }
        } catch (error) {
            console.error("제출 실패:", error);
            alert("전송 중 오류가 발생했습니다.");
            setStep("upload");
        } finally {
            setMultiSubmitting(false);
            setMultiVerifyingIndex(null);
        }
    };

    // 반려된 슬롯만 다시 업로드
    const handleRetrySlot = (idx: number) => {
        const newSlots = [...slots];
        newSlots[idx] = { file: null, img: null, fileType: null, fileName: "", verificationResult: null, status: "empty" };
        setSlots(newSlots);
        setStep("upload");
    };

    const descriptions = DOCUMENT_DESCRIPTIONS[itemId] || [];

    const goBack = () => {
        const query = new URLSearchParams({ userId, name, phone, region, subRegion, role });
        router.push(`/dashboard/unified?${query.toString()}`);
    };

    // =============================================
    // 렌더링
    // =============================================

    // --- 갤러리 모드 (영업소 전경 사진 등 — 무제한 다중 파일, OCR 없음) ---
    if (isGallery) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <header className="bg-white p-4 flex gap-4 items-center border-b">
                    <ChevronLeft className="cursor-pointer" onClick={goBack} />
                    <h1 className="font-bold">{docTitle} 제출</h1>
                </header>

                <main className="flex-1 p-6 flex flex-col">
                    {step === "upload" && (
                        <div className="flex-1 flex flex-col gap-5">
                            {/* 안내 */}
                            {descriptions.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <div className="text-sm font-bold text-slate-700 mb-2">📋 제출 안내</div>
                                    <ul className="space-y-1.5">
                                        {descriptions.map((desc, idx) => (
                                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                                <span className="text-letus-orange mt-0.5">•</span>
                                                <span>{renderDescriptionText(desc.text)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                                📷 사진을 <strong>여러 장</strong> 선택할 수 있습니다. 실외(간판/현관)와 실내(장비) 사진을 모두 포함해주세요.
                            </div>

                            {/* 사진 그리드 */}
                            {galleryPreviews.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {galleryPreviews.map((preview, idx) => (
                                        <div key={idx} className="relative group">
                                            <img
                                                src={preview}
                                                alt={`사진 ${idx + 1}`}
                                                className="w-full h-28 object-cover rounded-lg border-2 border-slate-200"
                                            />
                                            <button
                                                onClick={() => handleGalleryRemove(idx)}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                                                {idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 추가 버튼 */}
                            <Card
                                className={`border-2 border-dashed rounded-xl transition-colors ${isProcessingFile
                                    ? "border-letus-orange/50 bg-orange-50/50 cursor-not-allowed"
                                    : "border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200"
                                    }`}
                                onClick={() => !isProcessingFile && galleryFileInput.current?.click()}
                            >
                                <CardContent className="flex items-center justify-center py-8 gap-3">
                                    {isProcessingFile ? (
                                        <>
                                            <div className="h-5 w-5 border-2 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-sm text-letus-charcoal font-bold">
                                                사진 최적화 중...
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-6 w-6 text-slate-400" />
                                            <span className="text-sm text-slate-500 font-medium">
                                                {galleryFiles.length === 0 ? "사진 선택하기" : "사진 추가하기"}
                                            </span>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                            <input
                                ref={galleryFileInput}
                                type="file"
                                className="hidden"
                                multiple
                                accept="image/jpeg, image/png, image/heic, image/heif"
                                onChange={handleGalleryAdd}
                                disabled={isProcessingFile}
                            />

                            {/* 제출 */}
                            <div className="mt-auto space-y-3 pt-4">
                                <Button
                                    className="w-full h-14 text-lg font-bold shadow-lg bg-letus-orange text-white hover:bg-letus-orange/90"
                                    disabled={galleryFiles.length === 0 || gallerySubmitting}
                                    onClick={handleGallerySubmit}
                                >
                                    {gallerySubmitting
                                        ? "업로드 중..."
                                        : `📸 사진 ${galleryFiles.length}장 제출하기`}
                                </Button>
                                <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={goBack}>
                                    목록으로 돌아가기
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === "complete" && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-4">
                            <div className="bg-green-100 p-6 rounded-full">
                                <CheckCircle2 className="h-16 w-16 text-green-600" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-slate-800">제출 완료!</h2>
                                <p className="text-sm text-slate-500 mt-2">
                                    {docTitle} {existingGalleryUrls.length}장이 제출되었습니다.
                                </p>
                            </div>

                            {/* 제출된 사진 미리보기 */}
                            {existingGalleryUrls.length > 0 && (
                                <div className="w-full max-w-md">
                                    <div className="text-xs font-bold text-slate-500 mb-2">📷 제출된 사진 ({existingGalleryUrls.length}장)</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {existingGalleryUrls.map((url, idx) => (
                                            <img
                                                key={idx}
                                                src={url}
                                                alt={`제출 사진 ${idx + 1}`}
                                                className="w-full h-24 object-cover rounded-lg border"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3 w-full max-w-xs">
                                <Button className="w-full bg-letus-orange text-white hover:bg-letus-orange/90" onClick={goBack}>
                                    목록으로 돌아가기
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full text-slate-400 text-xs"
                                    onClick={() => {
                                        setGalleryFiles([]);
                                        setGalleryPreviews([]);
                                        setStep("upload");
                                    }}
                                >
                                    다시 업로드하기
                                </Button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        );
    }

    // --- 다중 파일 모드 (위수탁계약서 + 부속합의서) ---
    if (isMultiFile) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <header className="bg-white p-4 flex gap-4 items-center border-b">
                    <ChevronLeft className="cursor-pointer" onClick={goBack} />
                    <h1 className="font-bold">{docTitle} 제출</h1>
                </header>

                <main className="flex-1 p-6 flex flex-col">
                    {/* Upload / Verify 단계 */}
                    {step === "upload" && (
                        <div className="flex-1 flex flex-col gap-5">
                            {/* 안내 */}
                            {descriptions.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <div className="text-sm font-bold text-slate-700 mb-2">📋 제출 안내</div>
                                    <ul className="space-y-1.5">
                                        {descriptions.map((desc, idx) => (
                                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                                <span className="text-letus-orange mt-0.5">•</span>
                                                <span>{renderDescriptionText(desc.text)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                                📎 이 항목은 <strong>위수탁계약서</strong>와 <strong>부속합의서</strong> 2개 파일을 각각 업로드해주세요.
                            </div>

                            {/* 2개 슬롯 */}
                            {MULTI_FILE_LABELS.map((label, idx) => (
                                <div key={idx} className="space-y-2">
                                    <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${slots[idx].status === "verified" ? "bg-green-100 text-green-600"
                                            : slots[idx].status === "rejected" ? "bg-red-100 text-red-600"
                                                : "bg-slate-200 text-slate-500"
                                            }`}>{idx + 1}</span>
                                        {label}
                                        {slots[idx].status === "verified" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                        {slots[idx].status === "rejected" && <X className="h-4 w-4 text-red-500" />}
                                    </div>

                                    {slots[idx].status === "empty" ? (
                                        <Card
                                            className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors"
                                            onClick={() => {
                                                setActiveSlotIndex(idx);
                                                setTimeout(() => slotFileInput.current?.click(), 100);
                                            }}
                                        >
                                            <CardContent className="flex items-center justify-center py-8 gap-3">
                                                <Plus className="h-6 w-6 text-slate-400" />
                                                <span className="text-sm text-slate-500 font-medium">{label} 업로드하기</span>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <Card className={`border rounded-xl overflow-hidden ${slots[idx].status === "rejected" ? "border-red-300"
                                            : slots[idx].status === "verified" ? "border-green-300"
                                                : "border-letus-orange/30"
                                            }`}>
                                            <CardContent className="p-3 flex items-center gap-3">
                                                {slots[idx].fileType === "application/pdf" ? (
                                                    <div className="w-14 h-14 bg-slate-100 rounded flex items-center justify-center">
                                                        <FileText className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                ) : slots[idx].img ? (
                                                    <img src={slots[idx].img!} className="w-14 h-14 object-cover rounded" alt={label} />
                                                ) : (
                                                    <div className="w-14 h-14 bg-slate-100 rounded flex items-center justify-center">
                                                        <FileIcon className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-slate-700 truncate">{slots[idx].fileName}</div>
                                                    <div className={`text-xs mt-0.5 ${slots[idx].status === "verified" ? "text-green-600"
                                                        : slots[idx].status === "rejected" ? "text-red-600"
                                                            : "text-slate-400"
                                                        }`}>
                                                        {slots[idx].status === "verified" ? "✅ 적합"
                                                            : slots[idx].status === "rejected" ? "❌ 반려"
                                                                : "선택됨"}
                                                    </div>
                                                </div>
                                                {(slots[idx].status === "selected" || slots[idx].status === "rejected") && (
                                                    <button onClick={() => removeSlotFile(idx)} className="text-slate-400 hover:text-red-500 p-1">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            ))}

                            <input ref={slotFileInput} type="file" className="hidden" accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleSlotFile} />

                            {/* 제출 버튼 */}
                            <div className="mt-auto space-y-3 pt-4">
                                <Button
                                    className="w-full h-14 text-lg font-bold shadow-lg bg-letus-orange text-white hover:bg-letus-orange/90"
                                    disabled={multiSubmitting || !slots.some(s => s.file !== null)}
                                    onClick={handleMultiSubmit}
                                >
                                    {multiSubmitting ? "전송 중..." : "서류 제출하기"}
                                </Button>
                                <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={goBack}>
                                    취소하고 돌아가기
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Submitting / Verifying */}
                    {step === "reviewing" && (
                        <div className="flex-1 flex flex-col pt-2 animate-fade-in-up">
                            {/* 안내 배너 (반려 vs 심사중) */}
                            {slots.some(s => s.status === "rejected") ? (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                                    <div className="flex gap-3">
                                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <h3 className="font-bold text-red-800 text-sm">서류가 반려되었습니다.</h3>
                                            <p className="text-xs text-red-600 mt-1">
                                                반려 사유를 확인하고 아래에서 다시 업로드해주세요.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                                    <div className="flex gap-3 relative z-10">
                                        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                                            <FileText className="h-4 w-4 text-yellow-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-yellow-800 text-sm">관리자 확인 중입니다.</h3>
                                            <p className="text-xs text-yellow-600 mt-1 leading-relaxed">
                                                제출하신 서류를 매니저가 직접 확인하고 있습니다.<br />
                                                확인이 완료될 때까지 잠시만 기다려주세요.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 슬롯 상태 표시 */}
                            <div className="space-y-4 mb-6">
                                {MULTI_FILE_LABELS.map((label, idx) => {
                                    const slot = slots[idx];
                                    const isRejected = slot.status === "rejected";
                                    const vr = slot.verificationResult;

                                    return (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                                                <span>{label}</span>
                                                {isRejected ? (
                                                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <X className="h-3 w-3" /> 반려됨
                                                    </span>
                                                ) : slot.status === "verified" ? (
                                                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <Check className="h-3 w-3" /> 확인 대기
                                                    </span>
                                                ) : null}
                                            </div>

                                            <Card className={`border rounded-xl overflow-hidden ${isRejected ? "border-red-300 shadow-sm" : "border-slate-200"}`}>
                                                <CardContent className="p-3">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center overflow-hidden border">
                                                            {slot.savedUrl ? (
                                                                <img src={slot.savedUrl} className="w-full h-full object-cover" alt="제출본" />
                                                            ) : (
                                                                <FileText className="h-6 w-6 text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-slate-700 truncate">
                                                                {slot.fileName || "제출된 파일"}
                                                            </div>
                                                            <div className="text-xs text-slate-400 mt-0.5">업로드 완료</div>
                                                        </div>
                                                        {slot.savedUrl && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-xs border-slate-200 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                onClick={() => window.open(slot.savedUrl!, "_blank")}
                                                            >
                                                                원본 보기
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* AI 점검 결과 (반려 사유 + 추출 데이터) — pending/rejected 모두 표시 */}
                                                    {vr && !vr.error && !vr.skipped && (
                                                        <div className={`mt-3 p-3 rounded-lg text-xs space-y-2 border ${isRejected ? "bg-red-50 border-red-100" : "bg-yellow-50 border-yellow-100"}`}>
                                                            <div className="flex justify-between items-center">
                                                                <p className={`font-bold ${isRejected ? "text-red-800" : "text-yellow-800"}`}>
                                                                    AI 점검 결과
                                                                </p>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${vr.overall_result === "반려" ? "bg-red-200 text-red-700" : "bg-green-200 text-green-700"}`}>
                                                                    {vr.overall_result || "반려"}
                                                                </span>
                                                            </div>
                                                            {vr.rejection_reasons?.length > 0 && (
                                                                <div>
                                                                    <p className="font-bold text-red-600 mb-1">반려 사유</p>
                                                                    {vr.rejection_reasons.map((reason: string, i: number) => (
                                                                        <div key={i} className="flex gap-1.5 text-red-600">
                                                                            <span className="shrink-0">•</span>
                                                                            <span>{reason}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {vr.guidance_message && (
                                                                <div className="bg-white/60 p-2 rounded border text-slate-500 italic">
                                                                    &quot;{vr.guidance_message}&quot;
                                                                </div>
                                                            )}
                                                            {vr.extracted_data && Object.keys(vr.extracted_data).length > 0 && (
                                                                <div className="pt-2 border-t border-slate-200/60">
                                                                    <div className="text-[10px] text-slate-400 font-medium mb-1 uppercase">추출 데이터</div>
                                                                    <div className="grid grid-cols-2 gap-1.5">
                                                                        {Object.entries(vr.extracted_data).slice(0, 4).map(([key, val]: any) => (
                                                                            <div key={key} className="bg-white/60 p-1.5 rounded">
                                                                                <div className="text-[9px] text-slate-400">{key}</div>
                                                                                <div className="text-[11px] font-bold text-slate-700 truncate">{val}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 재업로드 버튼 — 반려/대기 상관없이 항상 제공 */}
                                                    <Button
                                                        variant="outline"
                                                        className={`w-full mt-4 h-11 font-bold text-sm transition-all ${isRejected
                                                            ? "border-red-200 text-red-600 hover:bg-red-50"
                                                            : "border-letus-orange/30 text-letus-orange hover:bg-orange-50"}`}
                                                        onClick={() => handleRetrySlot(idx)}
                                                    >
                                                        <RefreshCw className="h-4 w-4 mr-2" />
                                                        {isRejected ? `${label} 다시 업로드` : `${label} 수정해서 다시 올리기`}
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 하단 취소 버튼 */}
                            <div className="mt-auto pt-6 space-y-3">
                                <Button
                                    variant="outline"
                                    className="w-full h-14 text-[15px] font-medium border-slate-200 text-red-500 hover:bg-red-50 hover:text-red-600"
                                    onClick={handleCancel}
                                >
                                    서류 제출 전체 취소하기
                                </Button>
                                <Button variant="ghost" className="w-full text-slate-400 text-[13px]" onClick={goBack}>
                                    대시보드로 돌아가기
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === "submitting" && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                            <div className="w-12 h-12 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-500 font-medium">
                                {multiVerifyingIndex !== null
                                    ? `AI가 ${MULTI_FILE_LABELS[multiVerifyingIndex]}을(를) 점검하고 있습니다...`
                                    : "서류를 업로드하고 있습니다..."}
                            </p>
                            <p className="text-xs text-slate-400">약 10~20초 정도 소요될 수 있습니다.</p>
                        </div>
                    )}

                    {/* Complete */}
                    {step === "complete" && (
                        <div className="flex-1 flex flex-col gap-5 py-4">
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-slate-800 mb-1">점검 결과</h2>
                                <p className="text-sm text-slate-500">각 서류의 AI 자동 점검 결과입니다.</p>
                            </div>

                            {/* 각 슬롯별 결과 카드 */}
                            {MULTI_FILE_LABELS.map((label, idx) => {
                                const slot = slots[idx];
                                const vr = slot.verificationResult;
                                const isOk = slot.status === "verified";
                                const isRejected = slot.status === "rejected";
                                const isEmpty = slot.status === "empty" && !slot.savedUrl;

                                return (
                                    <Card key={idx} className={`border-2 ${isOk ? "border-green-200" : isRejected ? "border-red-200" : "border-slate-200"}`}>
                                        <CardHeader className={`py-3 ${isOk ? "bg-green-50" : isRejected ? "bg-red-50" : "bg-slate-50"}`}>
                                            <div className="flex justify-between items-center">
                                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                    <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${isOk ? "bg-green-200 text-green-700" : isRejected ? "bg-red-200 text-red-700" : "bg-slate-200 text-slate-500"
                                                        }`}>{idx + 1}</span>
                                                    {label}
                                                </CardTitle>
                                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${isOk ? "bg-green-200 text-green-700" : isRejected ? "bg-red-200 text-red-700" : "bg-slate-200 text-slate-500"
                                                    }`}>
                                                    {isOk ? "적합" : isRejected ? "반려" : "미제출"}
                                                </span>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-3 space-y-3">
                                            {vr && !vr.error && !vr.skipped && (
                                                <>
                                                    {vr.rejection_reasons?.length > 0 && (
                                                        <div>
                                                            <div className="text-xs font-bold text-red-600 mb-1">반려 사유</div>
                                                            <ul className="text-xs text-slate-600 list-disc list-inside">
                                                                {vr.rejection_reasons.map((reason: string, i: number) => (
                                                                    <li key={i}>{reason}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {vr.guidance_message && (
                                                        <div className="bg-slate-50 p-2 rounded border text-xs text-slate-500 italic">
                                                            &quot;{vr.guidance_message}&quot;
                                                        </div>
                                                    )}
                                                    {vr.extracted_data && Object.keys(vr.extracted_data).length > 0 && (
                                                        <div className="pt-2 border-t">
                                                            <div className="text-[10px] text-slate-400 font-medium mb-1 uppercase">추출 데이터</div>
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                {Object.entries(vr.extracted_data).slice(0, 4).map(([key, val]: any) => (
                                                                    <div key={key} className="bg-slate-50 p-1.5 rounded">
                                                                        <div className="text-[9px] text-slate-400">{key}</div>
                                                                        <div className="text-[11px] font-bold text-slate-700 truncate">{val}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {vr?.error && (
                                                <div className="text-xs text-red-500">오류: {vr.error}</div>
                                            )}
                                            {isEmpty && (
                                                <div className="text-xs text-slate-400">파일이 선택되지 않았습니다.</div>
                                            )}

                                            {/* 반려 또는 미제출인 경우 개별 재업로드 버튼 */}
                                            {(isRejected || isEmpty) && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full text-xs border-letus-orange text-letus-orange hover:bg-letus-orange/10"
                                                    onClick={() => handleRetrySlot(idx)}
                                                >
                                                    {isRejected ? `${label} 다시 업로드하기` : `${label} 업로드하기`}
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}

                            <div className="space-y-3 mt-auto">
                                <Button className="w-full bg-letus-orange text-white hover:bg-letus-orange/90" onClick={goBack}>
                                    목록으로 돌아가기
                                </Button>
                                {existingDocId && (
                                    <Button variant="ghost" className="w-full text-red-400 text-xs hover:text-red-600" onClick={handleCancel}>
                                        전체 제출 취소하기
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        );
    }

    // === 단일 파일 모드 (기존 로직 그대로) ===
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white p-4 flex gap-4 items-center border-b">
                <ChevronLeft className="cursor-pointer" onClick={goBack} />
                <h1 className="font-bold">{docTitle} 제출</h1>
            </header>

            <main className="flex-1 p-6 flex flex-col">
                {step === "upload" && (
                    <div className="flex-1 flex flex-col justify-center gap-6">
                        {descriptions.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="text-sm font-bold text-slate-700 mb-2">📋 제출 안내</div>
                                <ul className="space-y-1.5">
                                    {descriptions.map((desc, idx) => (
                                        <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                            <span className="text-letus-orange mt-0.5">•</span>
                                            <span>{renderDescriptionText(desc.text)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <Card
                            className="border-2 border-dashed border-slate-300 rounded-xl flex-1 max-h-[400px] flex flex-col items-center justify-center bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors"
                            onClick={() => fileInput.current?.click()}
                        >
                            <CardContent className="flex flex-col items-center justify-center h-full">
                                <Camera className="h-12 w-12 text-slate-400 mb-4" />
                                <span className="font-bold text-slate-500">사진 / PDF 업로드하기</span>
                                <p className="text-xs text-slate-400 mt-2">이미지 파일 또는 PDF 파일을 선택해주세요.</p>
                                <input ref={fileInput} type="file" className="hidden" accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleFile} />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {step === "verify" && (
                    <div className="space-y-6 flex-1 flex flex-col">
                        <Card className="flex-1 overflow-hidden flex flex-col border-letus-orange/20 shadow-sm">
                            <CardHeader className="bg-slate-50 border-b py-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <FileIcon className="h-4 w-4 text-letus-orange" />
                                    {fileName}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 p-0 bg-slate-200 flex items-center justify-center overflow-auto">
                                {fileType === "application/pdf" ? (
                                    <div className="flex flex-col items-center gap-3 text-slate-500 py-10">
                                        <FileText className="h-20 w-20 text-slate-400" />
                                        <div className="text-center">
                                            <p className="font-bold">PDF 문서 선택됨</p>
                                            <p className="text-xs">미리보기는 지원하지 않으나 전송은 가능합니다.</p>
                                        </div>
                                    </div>
                                ) : (
                                    img && <img src={img} className="max-w-full" alt="미리보기" />
                                )}
                            </CardContent>
                        </Card>
                        <div className="space-y-3">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-800 flex gap-3 items-center">
                                <CheckCircle2 className="text-blue-600 h-5 w-5 shrink-0" />
                                <div className="text-xs font-medium leading-tight">
                                    파일이 성공적으로 선택되었습니다.<br />
                                    내용을 확인하신 후 아래 버튼을 눌러 제출을 완료하세요.
                                </div>
                            </div>
                            <Button className="w-full h-14 text-lg font-bold shadow-lg bg-letus-orange text-white hover:bg-letus-orange/90" disabled={isSubmitting} onClick={handleFinalSubmit}>
                                {isSubmitting ? "전송 중..." : "서류 제출하기"}
                            </Button>
                            <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={() => setStep("upload")}>
                                취소하고 다시 업로드하기
                            </Button>
                        </div>
                    </div>
                )}

                {(step === "submitting" || isVerifying) && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium">
                            {isVerifying ? "AI가 서류를 자동 점검하고 있습니다..." : "서류를 업로드하고 있습니다..."}
                        </p>
                        {isVerifying && <p className="text-xs text-slate-400">약 10~20초 정도 소요될 수 있습니다.</p>}
                    </div>
                )}

                {/* 심사 대기 중 (pending) — 반려 사유 + 재업로드 */}
                {step === "reviewing" && (
                    <div className="flex-1 flex flex-col gap-5 py-4">
                        {/* 상태 배너 */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
                            <Clock className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <div className="text-sm font-bold text-yellow-800">관리자 확인 중 ⏳</div>
                                <p className="text-xs text-yellow-700 mt-1">
                                    AI 자동 점검에서 일부 항목이 부적합 판정되어, 관리자가 수동으로 확인하고 있습니다.
                                    수정된 서류가 있다면 아래에서 재업로드할 수 있습니다.
                                </p>
                            </div>
                        </div>

                        {/* 기존 서류 이미지 미리보기 */}
                        {existingFileUrl && (
                            <Card className="border border-slate-200 overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b py-2">
                                    <CardTitle className="text-xs text-slate-500 flex items-center gap-2">
                                        <FileIcon className="h-3.5 w-3.5" /> 현재 접수된 서류: {fileName}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 bg-slate-200 flex items-center justify-center max-h-48 overflow-hidden">
                                    <img src={existingFileUrl} className="max-w-full max-h-48 object-contain" alt="접수된 서류" />
                                </CardContent>
                            </Card>
                        )}

                        {/* AI 점검 결과 (반려 사유) */}
                        {verificationResult && !verificationResult.skipped && (
                            <Card className="border-2 border-red-200">
                                <CardHeader className="bg-red-50 py-3">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-red-500" /> AI 점검 결과
                                        </CardTitle>
                                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-200 text-red-700">
                                            {verificationResult.overall_result}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3">
                                    {verificationResult.rejection_reasons?.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold text-red-600 mb-1">반려 사유</div>
                                            <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                                                {verificationResult.rejection_reasons.map((reason: string, i: number) => (
                                                    <li key={i}>{reason}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {verificationResult.guidance_message && (
                                        <div className="bg-slate-50 p-3 rounded border border-slate-100 italic text-xs text-slate-500">
                                            &quot;{verificationResult.guidance_message}&quot;
                                        </div>
                                    )}
                                    {verificationResult.extracted_data && Object.keys(verificationResult.extracted_data).length > 0 && (
                                        <div className="pt-2 border-t border-slate-100">
                                            <div className="text-[10px] text-slate-400 font-medium mb-2 uppercase tracking-wider">추출 데이터</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(verificationResult.extracted_data).slice(0, 4).map(([key, val]: any) => (
                                                    <div key={key} className="bg-slate-50 p-2 rounded">
                                                        <div className="text-[9px] text-slate-400">{key}</div>
                                                        <div className="text-[11px] font-bold text-slate-700 truncate">{val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* 재업로드 영역 */}
                        <div className="space-y-3 mt-auto">
                            <Card
                                className="border-2 border-dashed border-letus-orange/40 rounded-xl bg-orange-50/50 cursor-pointer hover:bg-orange-100/50 transition-colors"
                                onClick={() => fileInput.current?.click()}
                            >
                                <CardContent className="flex items-center justify-center py-6 gap-3">
                                    <Camera className="h-6 w-6 text-letus-orange" />
                                    <span className="text-sm font-bold text-letus-orange">수정된 서류 재업로드하기</span>
                                </CardContent>
                            </Card>
                            <input ref={fileInput} type="file" className="hidden" accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf" onChange={handleFile} />

                            <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={goBack}>
                                목록으로 돌아가기
                            </Button>
                        </div>
                    </div>
                )}

                {step === "complete" && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-4">
                        <div className={`${verificationResult?.overall_result === '반려' ? 'bg-red-100' : 'bg-green-100'} p-6 rounded-full`}>
                            {verificationResult?.overall_result === '반려' ? (
                                <X className="h-16 w-16 text-red-600" />
                            ) : (
                                <CheckCircle2 className="h-16 w-16 text-green-600" />
                            )}
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-slate-800">
                                {verificationResult?.overall_result === '반려' ? "점검 결과: 반려" : "제출 완료!"}
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                {verificationResult?.overall_result === '반려'
                                    ? "AI 점검 결과 부적합 항목이 발견되었습니다. 서류를 수정 후 다시 업로드해주세요."
                                    : `${docTitle}이(가) 성공적으로 제출되었습니다.`}
                            </p>
                        </div>

                        {verificationResult && !verificationResult.skipped && (
                            <Card className={`w-full max-w-md border-2 ${verificationResult.overall_result === '반려' ? 'border-red-200' : 'border-green-200'}`}>
                                <CardHeader className={`${verificationResult.overall_result === '반려' ? 'bg-red-50' : 'bg-green-50'} py-3`}>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">🔍 AI 자동 점검 리포트</CardTitle>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${verificationResult.overall_result === '반려' ? 'bg-red-200 text-red-700' : 'bg-green-200 text-green-700'}`}>
                                            {verificationResult.overall_result}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4">
                                    {verificationResult.rejection_reasons?.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold text-red-600 mb-1">반려 사유</div>
                                            <ul className="text-xs text-slate-600 list-disc list-inside">
                                                {verificationResult.rejection_reasons.map((reason: string, i: number) => (
                                                    <li key={i}>{reason}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {verificationResult.guidance_message && (
                                        <div className="bg-slate-50 p-3 rounded border border-slate-100 italic text-xs text-slate-500">
                                            &quot;{verificationResult.guidance_message}&quot;
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-100">
                                        <div className="text-[10px] text-slate-400 font-medium mb-2 uppercase tracking-wider">주요 추출 데이터</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(verificationResult.extracted_data || {}).slice(0, 6).map(([key, val]: any) => (
                                                <div key={key} className="bg-slate-50 p-2 rounded">
                                                    <div className="text-[9px] text-slate-400">{key}</div>
                                                    <div className="text-[11px] font-bold text-slate-700 truncate">{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="space-y-3 w-full max-w-xs">
                            {verificationResult?.overall_result === '반려' ? (
                                <>
                                    <Button className="w-full h-14 text-lg font-bold shadow-lg bg-letus-orange text-white hover:bg-letus-orange/90" onClick={handleRetryUpload}>
                                        다시 업로드하기
                                    </Button>
                                    <Button variant="ghost" className="w-full text-slate-400 text-xs" onClick={goBack}>
                                        목록으로 돌아가기
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button className="w-full bg-letus-orange text-white hover:bg-letus-orange/90" onClick={goBack}>
                                        목록으로 돌아가기
                                    </Button>
                                    <Button variant="ghost" className="w-full text-red-400 text-xs hover:text-red-600" onClick={handleCancel}>
                                        제출 취소하기
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function UploadPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-letus-orange border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <UploadPageContent />
        </Suspense>
    );
}
