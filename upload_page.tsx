"use client"

import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Upload, FileText, Check, AlertTriangle, RefreshCw, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function UploadPage() {
    const params = useParams()
    const router = useRouter()
    const docId = params.docId as string
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [step, setStep] = useState<"upload" | "scanning" | "verify">("upload")
    const [uploadedImage, setUploadedImage] = useState<string | null>(null)
    const [ocrData, setOcrData] = useState<any>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (e) => {
                setUploadedImage(e.target?.result as string)
                simulateOCR()
            }
            reader.readAsDataURL(file)
        }
    }

    const simulateOCR = () => {
        setStep("scanning")
        // Simulate API delay
        setTimeout(() => {
            // Mock Data based on doc type
            setOcrData({
                name: "홍길동",
                regNumber: "123-45-67890",
                date: "2024-05-20",
                address: "서울시 강남구 논현동",
                isValid: true
            })
            setStep("verify")
        }, 2000)
    }

    const handleVerify = () => {
        // Submit verification
        alert("서류 검증이 완료되었습니다.")
        router.back()
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b px-4 py-3 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                <h1 className="font-bold text-lg">서류 업로드 및 검증</h1>
            </header>

            <main className="flex-1 p-4 md:p-8 flex flex-col md:flex-row gap-6 max-w-6xl mx-auto w-full">
                {/* Left Side: Image Preview / Upload Area */}
                <div className="flex-1 flex flex-col gap-4">
                    <Card className="flex-1 min-h-[400px] flex items-center justify-center bg-slate-100 border-dashed border-2 relative overflow-hidden">
                        {uploadedImage ? (
                            <img
                                src={uploadedImage}
                                alt="Uploaded Document"
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="text-center p-6">
                                <Upload className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                                <p className="text-slate-500 mb-4">서류를 드래그하거나 클릭하여 업로드하세요</p>
                                <Button onClick={() => fileInputRef.current?.click()}>
                                    파일 선택
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </div>
                        )}

                        {step === "scanning" && (
                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                                <RefreshCw className="h-10 w-10 animate-spin mb-4" />
                                <p className="text-lg font-medium">OCR 스캔 중...</p>
                                <p className="text-sm opacity-80">텍스트를 추출하고 유효성을 검사합니다.</p>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right Side: Verification Form */}
                <div className="w-full md:w-[400px] flex flex-col gap-4">
                    <Card className="flex-1">
                        <CardContent className="p-6 space-y-6">
                            <div className="flex items-center gap-2 pb-4 border-b">
                                <FileText className="h-5 w-5 text-blue-600" />
                                <h2 className="font-bold">추출 데이터 확인</h2>
                            </div>

                            {step === "verify" && ocrData ? (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 p-4 rounded-md flex gap-3 items-start">
                                        <Check className="h-5 w-5 text-blue-600 mt-0.5" />
                                        <div className="text-sm text-blue-800">
                                            <strong>인식 성공</strong><br />
                                            서류에서 텍스트를 성공적으로 추출했습니다. 아래 내용을 확인해주세요.
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label>성명 / 상호</Label>
                                            <Input defaultValue={ocrData.name} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>등록번호 / 주민번호</Label>
                                            <Input defaultValue={ocrData.regNumber} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>발급일자 / 계약일</Label>
                                            <Input defaultValue={ocrData.date} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>주소</Label>
                                            <Input defaultValue={ocrData.address} />
                                        </div>
                                    </div>

                                    <div className="pt-4 flex gap-3">
                                        <Button
                                            variant="outline"
                                            className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                                            onClick={() => setStep("upload")}
                                        >
                                            재촬영
                                        </Button>
                                        <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleVerify}>
                                            검증 완료
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400">
                                    <div className="mb-4">
                                        <FileText className="h-12 w-12 mx-auto opacity-20" />
                                    </div>
                                    <p>서류를 업로드하면<br />자동으로 내용을 분석하여 표시합니다.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {step === "verify" && (
                        <Card className="bg-yellow-50 border-yellow-200">
                            <CardContent className="p-4 flex gap-3">
                                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                                <div className="text-sm text-yellow-800">
                                    <strong>주의:</strong> 인식된 정보가 실제 서류와 다를 경우, 직접 수정해주세요.
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    )
}
