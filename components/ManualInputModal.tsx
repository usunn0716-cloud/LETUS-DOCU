"use client";

import { useState } from "react";
import { X, AlertCircle, Edit3, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 서류 유형별 수동 입력 필드 정의
// ※ 이것은 "개인정보 추출" 키워드 (이름, 번호 등) 입니다.
//   반려/적합 판정 키워드(업태, 계약기간, 날인 등)와는 별개입니다.
const MANUAL_FIELDS: Record<string, { key: string; label: string; placeholder?: string }[]> = {
    "운전면허증": [
        { key: "이름", label: "성명", placeholder: "홍길동" },
        { key: "생년월일", label: "생년월일", placeholder: "1990-12-15" },
        { key: "거주지주소", label: "거주지 주소", placeholder: "서울시 강남구..." },
        { key: "운전면허종류", label: "면허 종류", placeholder: "1종 보통" },
        { key: "운전면허번호", label: "면허번호", placeholder: "11-00-000000-00" },
    ],
    "자동차등록증": [
        { key: "차량종류", label: "차량 종류(차종)", placeholder: "일반화물" },
        { key: "차량명", label: "차명", placeholder: "포터2" },
        { key: "차량번호", label: "차량번호", placeholder: "경기12가3456" },
        { key: "연식", label: "연식(제작연월)", placeholder: "2020-05" },
        { key: "연료종류", label: "연료", placeholder: "경유" },
        { key: "번호판종류", label: "번호판 종류(용도)", placeholder: "자가용" },
        { key: "적재함형태_적재량", label: "최대적재량", placeholder: "1000kg" },
        { key: "이산화탄소배출량", label: "CO2 배출량", placeholder: "150g/km" },
    ],
    "위수탁계약서": [
        { key: "연락처", label: "연락처", placeholder: "010-1234-5678" },
        { key: "이메일", label: "이메일", placeholder: "example@email.com" },
        { key: "경력", label: "경력", placeholder: "3년" },
    ],
    "화물운송종사 자격증": [
        { key: "화물운송종사자격증번호", label: "자격증번호", placeholder: "12345678" },
        { key: "종사자격증취득일", label: "취득일", placeholder: "2020-01-01" },
    ],
    "화물운송종사자격증": [
        { key: "화물운송종사자격증번호", label: "자격증번호", placeholder: "12345678" },
        { key: "종사자격증취득일", label: "취득일", placeholder: "2020-01-01" },
    ],
    "사업자등록증": [
        { key: "상호", label: "상호", placeholder: "○○ 운송" },
        { key: "등록번호", label: "사업자등록번호", placeholder: "123-45-67890" },
        { key: "개업연월일", label: "개업연월일", placeholder: "2020-01-01" },
        { key: "업태", label: "업태", placeholder: "운수업" },
        { key: "종목", label: "종목", placeholder: "화물운송업" },
    ],
    "사업자등록증명원": [
        { key: "상호", label: "상호", placeholder: "○○ 운송" },
        { key: "등록번호", label: "사업자등록번호", placeholder: "123-45-67890" },
        { key: "개업연월일", label: "개업연월일", placeholder: "2020-01-01" },
        { key: "업태", label: "업태", placeholder: "운수업" },
        { key: "종목", label: "종목", placeholder: "화물운송업" },
    ],
};

export interface ManualInputResult {
    docType: string;
    fileId: string;
    manualData: Record<string, string>;
    originalOcrData?: Record<string, string>;
}

interface ManualInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (result: ManualInputResult) => void;
    docType: string;
    fileId: string;
    ocrExtractedData?: Record<string, string>;
    extractionStatus?: Record<string, "success" | "failed">;
    fileName?: string;
}

export default function ManualInputModal({
    isOpen,
    onClose,
    onSubmit,
    docType,
    fileId,
    ocrExtractedData = {},
    extractionStatus = {},
    fileName,
}: ManualInputModalProps) {
    const fields = MANUAL_FIELDS[docType] || [];
    
    // OCR이 부분적으로 인식한 데이터는 pre-fill
    const [formData, setFormData] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        fields.forEach(f => {
            initial[f.key] = ocrExtractedData[f.key] || "";
        });
        return initial;
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleFieldChange = (key: string, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async () => {
        // 최소 1개 필드 입력 확인
        const hasInput = Object.values(formData).some(v => v.trim() !== "");
        if (!hasInput) {
            alert("최소 1개 항목을 입력해주세요.");
            return;
        }
        setIsSubmitting(true);
        try {
            onSubmit({
                docType,
                fileId,
                manualData: formData,
                originalOcrData: ocrExtractedData,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-100">
                            <Edit3 className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-slate-800">수동 입력 보완</h3>
                            <p className="text-[10px] text-slate-400">{docType} · {fileName || "파일"}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Info banner */}
                <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                        <span className="font-bold">💡 안내:</span> AI가 서류에서 일부 정보를 읽지 못했습니다. 
                        빈칸으로 남은 항목만 직접 채워주세요. (서류 자체는 적합 판정을 받았습니다.)
                    </p>
                </div>

                {/* Form fields */}
                <div className="px-5 py-4 space-y-3">
                    {fields.length > 0 ? (
                        fields.map(field => {
                            const isSuccess = extractionStatus[field.key] === "success" || 
                                              (ocrExtractedData[field.key] && ocrExtractedData[field.key] !== "확인불가");
                            return (
                                <div key={field.key}>
                                    <label className="text-xs font-medium text-slate-600 mb-1 block">
                                        {field.label}
                                        {isSuccess && (
                                            <span className="ml-1 text-[10px] text-green-500 font-normal">(인식 완료)</span>
                                        )}
                                        {!isSuccess && (
                                            <span className="ml-1 text-[10px] text-red-500 font-normal">(필수 입력)</span>
                                        )}
                                    </label>
                                    <Input
                                        value={formData[field.key] || ""}
                                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        disabled={!!isSuccess}
                                        className={`h-10 text-sm ${
                                            isSuccess
                                                ? "border-green-200 bg-green-50/50 text-slate-500"
                                                : "border-amber-400 bg-white shadow-sm"
                                        }`}
                                    />
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-4">
                            이 서류 유형에 대한 수동 입력 필드가 정의되지 않았습니다.
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex gap-3 rounded-b-2xl">
                    <Button
                        variant="outline"
                        className="flex-1 h-11"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        건너뛰기
                    </Button>
                    <Button
                        className="flex-1 h-11 bg-letus-orange hover:bg-letus-orange/90 text-white font-bold shadow-lg shadow-orange-100"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 처리 중...</>
                        ) : (
                            <><CheckCircle2 className="w-4 h-4 mr-1" /> 확인 및 제출</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
