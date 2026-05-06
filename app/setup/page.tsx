"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, RefreshCw, Database, HardDrive, ArrowLeft, Loader2, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { testFirebaseConnection } from "@/lib/firebase-test";
import { seedRegionalData } from "@/lib/seed";
import Link from "next/link";

interface TestResult {
    name: string;
    status: "idle" | "testing" | "success" | "error";
    message: string;
    details?: string;
}

export default function FirebaseSetupPage() {
    const [tests, setTests] = useState<TestResult[]>([
        { name: "Firestore 연결", status: "idle", message: "테스트 대기 중" },
    ]);
    const [seedResult, setSeedResult] = useState<{ status: "idle" | "loading" | "done" | "error"; message: string }>({
        status: "idle",
        message: "",
    });
    const [envCheck, setEnvCheck] = useState<{ set: string[]; missing: string[] }>({ set: [], missing: [] });

    // 환경변수 체크 (클라이언트 사이드에서 NEXT_PUBLIC_ 접두사만 확인 가능)
    useEffect(() => {
        const vars = [
            { key: "NEXT_PUBLIC_FIREBASE_API_KEY", value: process.env.NEXT_PUBLIC_FIREBASE_API_KEY },
            { key: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", value: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN },
            { key: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", value: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
            { key: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", value: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET },
            { key: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", value: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID },
            { key: "NEXT_PUBLIC_FIREBASE_APP_ID", value: process.env.NEXT_PUBLIC_FIREBASE_APP_ID },
        ];

        const set = vars.filter(v => v.value && v.value !== "undefined" && !v.value.startsWith("여기에")).map(v => v.key);
        const missing = vars.filter(v => !v.value || v.value === "undefined" || v.value.startsWith("여기에")).map(v => v.key);
        setEnvCheck({ set, missing });
    }, []);

    const runFirestoreTest = async () => {
        setTests(prev => prev.map(t =>
            t.name === "Firestore 연결" ? { ...t, status: "testing", message: "연결 테스트 중..." } : t
        ));

        const result = await testFirebaseConnection();

        setTests(prev => prev.map(t =>
            t.name === "Firestore 연결"
                ? { ...t, status: result.success ? "success" : "error", message: result.message, details: result.details }
                : t
        ));
    };

    const runSeed = async () => {
        setSeedResult({ status: "loading", message: "데이터 시드 중..." });
        const result = await seedRegionalData();
        setSeedResult({
            status: result.success ? "done" : "error",
            message: result.message,
        });
    };

    const StatusIcon = ({ status }: { status: string }) => {
        switch (status) {
            case "testing": return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
            case "success": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
            case "error": return <XCircle className="h-5 w-5 text-red-500" />;
            default: return <Database className="h-5 w-5 text-slate-300" />;
        }
    };

    return (
        <div className="flex-1 bg-slate-50 p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">🔧 Firebase 연결 테스트</h1>
                        <p className="text-slate-500 text-sm">데이터베이스 연결 상태를 확인하고 초기 데이터를 설정합니다.</p>
                    </div>
                </div>

                {/* 환경변수 상태 체크 */}
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <HardDrive className="h-5 w-5" />
                            환경변수 상태
                        </CardTitle>
                        <CardDescription>
                            .env.local 파일에 설정된 Firebase 환경변수를 확인합니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {envCheck.set.length > 0 && (
                                <div className="bg-green-50 p-3 rounded-lg">
                                    <div className="text-sm font-medium text-green-700 mb-1">✅ 설정됨 ({envCheck.set.length}개)</div>
                                    <div className="text-xs text-green-600 font-mono space-y-0.5">
                                        {envCheck.set.map(v => <div key={v}>{v}</div>)}
                                    </div>
                                </div>
                            )}
                            {envCheck.missing.length > 0 && (
                                <div className="bg-red-50 p-3 rounded-lg">
                                    <div className="text-sm font-medium text-red-700 mb-1">❌ 미설정 ({envCheck.missing.length}개)</div>
                                    <div className="text-xs text-red-600 font-mono space-y-0.5">
                                        {envCheck.missing.map(v => <div key={v}>{v}</div>)}
                                    </div>
                                    <p className="text-xs text-red-500 mt-2">
                                        → .env.local.example을 참고하여 .env.local 파일을 설정해주세요.
                                    </p>
                                </div>
                            )}
                            {envCheck.set.length === 6 && envCheck.missing.length === 0 && (
                                <div className="text-sm text-green-600 font-medium">🎉 모든 환경변수가 설정되었습니다!</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Firestore 연결 테스트 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Firestore 연결 테스트
                        </CardTitle>
                        <CardDescription>
                            Firestore 데이터베이스에 문서를 생성/읽기/삭제하여 연결 상태를 확인합니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {tests.map((test) => (
                            <div key={test.name} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                                <StatusIcon status={test.status} />
                                <div className="flex-1">
                                    <div className="font-medium text-sm">{test.name}</div>
                                    <div className="text-xs text-slate-500">{test.message}</div>
                                    {test.details && (
                                        <div className="text-xs text-red-400 mt-1">{test.details}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <Button
                            onClick={runFirestoreTest}
                            className="w-full bg-letus-orange hover:bg-letus-orange/90"
                            disabled={tests.some(t => t.status === "testing")}
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            연결 테스트 실행
                        </Button>
                    </CardContent>
                </Card>

                {/* 초기 데이터 시드 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <UploadIcon className="h-5 w-5" />
                            초기 데이터 시드
                        </CardTitle>
                        <CardDescription>
                            영업소 데이터(33개소)를 Firestore에 업로드합니다. 연결 테스트 성공 후 실행하세요.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {seedResult.message && (
                            <div className={`p-3 rounded-lg text-sm ${seedResult.status === "error" ? "bg-red-50 text-red-700" : seedResult.status === "done" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                                {seedResult.message}
                            </div>
                        )}
                        <Button
                            onClick={runSeed}
                            variant="outline"
                            className="w-full"
                            disabled={seedResult.status === "loading"}
                        >
                            {seedResult.status === "loading" ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 업로드 중...</>
                            ) : (
                                <><Database className="h-4 w-4 mr-2" /> 영업소 데이터 시드 실행</>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* 다음 단계 안내 */}
                <Card className="bg-letus-black text-white">
                    <CardContent className="p-6 space-y-3">
                        <h3 className="font-bold text-lg">✅ 모두 완료되면?</h3>
                        <p className="text-gray-300 text-sm">
                            연결 테스트가 성공하고 데이터 시드가 완료되면,<br />
                            메인 페이지에서 로그인하여 정상 작동을 확인하세요.
                        </p>
                        <Link href="/">
                            <Button className="bg-letus-orange hover:bg-letus-orange/90 text-white mt-2">
                                메인 페이지로 이동
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
