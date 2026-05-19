"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Building2,
    ShieldCheck,
    ChevronRight,
    Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { REGIONAL_DATA } from "./data/mock";
import { findOrCreateUser } from "@/lib/firestore";

// 영업소별 PIN 코드 매핑
const SUB_REGION_PIN: Record<string, string> = {
    "양지6영업소((주)디에스엔지니어)": "482910",
    "양지7영업소((주)서현테크)": "159283",
    "양지8영업소(스타일룸)": "738192",
    "양지12영업소(TY서비스)": "294018",
    "양지2_2영업소(엠케이프로젝트퍼니처)": "610394",
    "양지23영업소(일룸)": "839201",
    "양지13영업소": "502918",
    "양지9영업소(그랑팩토리)": "381920",
    "안성1영업소(유빈산업)": "948201",
    "양지22영업소(에이와이가구)": "273819",
    "양지2_1영업소(요다프렌즈)": "519283",
    "양지14영업소(LHS)": "840192",
    "양지15영업소(CMS 프로모션)": "392810",
    "양지16영업소(오성)": "658291",
    "양지17영업소(온찬유통)": "104928",
    "양지18영업소(모든퍼니처)": "728391",
    "양지19영업소(드래곤)": "491028",
    "양지20영업소(정인유통)": "938201",
    "부산1영업소(태인유통)": "281930",
    "부산(기장)2영업소(태준유통)": "503928",
    "전남1영업소(스마일유통)": "819203",
    "창원1영업소(정빈유통)": "374829",
    "울산1영업소(수연유통)": "692018",
    "제주1영업소(스마일유통)": "158293",
    "대구1영업소(투윈스)": "402918",
    "대구2영업소(대구가구)": "938102",
    "대구3영업소(형제유통)": "271839",
    "대구4영업소(석퍼시스)": "582910",
    "대전1영업소(주식회사오제이더블유)": "719283",
    "대전2영업소(주식회사에스엔티)": "304918",
    "대전3영업소(주식회사티오피플랜)": "829104",
    "대전4영업소(무빙인)": "193820",
    "대전5영업소(비비디)": "648291",
    "광주1영업소(주식회사와이에스유통)": "316457",
    "광주2영업소(FIT퍼니처)": "946587",
    "전북1영업소(대영)": "351648",
};

export default function LandingPage() {
    const router = useRouter();
    const [mode, setMode] = useState<"portal" | "admin" | "region-admin" | null>(null);
    const [userType, setUserType] = useState<"manager" | "driver">("manager");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [birthday, setBirthday] = useState("");
    const [pinCode, setPinCode] = useState("");
    const [selectedRegion, setSelectedRegion] = useState<string>("");
    const [selectedSubRegion, setSelectedSubRegion] = useState<string>("");
    const [adminPw, setAdminPw] = useState("");
    const [regionAdminCenter, setRegionAdminCenter] = useState<string>("");
    const [regionAdminSubRegion, setRegionAdminSubRegion] = useState<string>("");
    const [regionAdminPw, setRegionAdminPw] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // 권역장 접속용 영업소 목록
    const regionAdminSubRegions = useMemo(() => {
        if (!regionAdminCenter) return [];
        return REGIONAL_DATA.filter(d => d.region === regionAdminCenter).map(d => d.subRegion);
    }, [regionAdminCenter]);

    const regions = useMemo(() => Array.from(new Set(REGIONAL_DATA.map(d => d.region))), []);
    const subRegions = useMemo(() => {
        if (!selectedRegion) return [];
        return REGIONAL_DATA.filter(d => d.region === selectedRegion).map(d => d.subRegion);
    }, [selectedRegion]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (mode === "admin") {
            const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "letus2024";
            if (adminPw !== correctPassword) {
                alert("관리자 비밀번호가 일치하지 않습니다.");
                return;
            }
            router.push("/dashboard/admin");
            return;
        }

        if (mode === "region-admin") {
            if (!regionAdminCenter || !regionAdminSubRegion) {
                alert("센터와 영업소를 모두 선택해주세요.");
                return;
            }
            if (regionAdminPw.length !== 4) {
                alert("비밀번호 4자리를 입력해주세요.");
                return;
            }
            setIsLoggingIn(true);
            try {
                const res = await fetch("/api/construction-sheet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "verifyPassword", subRegion: regionAdminSubRegion, password: regionAdminPw }),
                });
                const result = await res.json();
                if (result.valid) {
                    router.push(`/dashboard/region-admin?center=${encodeURIComponent(regionAdminCenter)}&subRegion=${encodeURIComponent(regionAdminSubRegion)}`);
                } else {
                    alert("비밀번호가 일치하지 않습니다.\n권역장 전용 비밀번호를 확인해주세요.");
                }
            } catch {
                alert("인증 중 오류가 발생했습니다.");
            } finally {
                setIsLoggingIn(false);
            }
            return;
        }

        if (!name || !phone || !selectedRegion || !selectedSubRegion || !birthday || !pinCode) {
            alert("모든 항목을 입력해주세요.");
            return;
        }

        // 생년월일 6자리 검증
        if (!/^\d{6}$/.test(birthday)) {
            alert("생년월일을 6자리 숫자로 입력해주세요. (예: 901215)");
            return;
        }

        // PIN 코드 검증
        const correctPin = SUB_REGION_PIN[selectedSubRegion];
        if (!correctPin) {
            alert("선택한 영업소에 PIN 코드가 설정되지 않았습니다. 관리자에게 문의하세요.");
            return;
        }
        if (pinCode !== correctPin) {
            alert("영업소 PIN 코드가 일치하지 않습니다.\n영업소장에게 PIN 코드를 확인해주세요.");
            return;
        }

        setIsLoggingIn(true);
        try {
            const user = await findOrCreateUser({
                name,
                phone,
                birthday,
                role: userType,
                region: selectedRegion,
                subRegion: selectedSubRegion,
            });

            const params = new URLSearchParams({
                userId: user.id!,
                name: user.name,
                phone: user.phone,
                birthday: birthday,
                region: user.region,
                subRegion: user.subRegion,
                role: user.role,
            });
            router.push(`/dashboard/unified?${params.toString()}`);
        } catch (error) {
            console.error("로그인 실패:", error);
            alert("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#FFF5F2]/30 items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8">
                {/* Logo */}
                <div className="text-center space-y-2">
                    <div className="inline-block p-3 rounded-full bg-white shadow-sm mb-4">
                        <ShieldCheck className="w-10 h-10 text-letus-orange" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-letus-black">LETUS 서류 통합 관리</h1>
                    <p className="text-letus-charcoal/80">필수 서류 제출 포털</p>
                </div>

                {/* Login Card */}
                <Card className="border-slate-200 shadow-xl bg-white/90 backdrop-blur">
                    <CardHeader>
                        <CardTitle>로그인 / 서류 제출</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Main portal button — 통합 진입 */}
                            {!mode && (
                                <div className="space-y-4">
                                    <div
                                        onClick={() => setMode("portal")}
                                        className="cursor-pointer rounded-xl border-2 border-letus-orange bg-[#FFF5F2] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98]"
                                    >
                                        <div className="p-3 rounded-full bg-letus-orange text-white">
                                            <Building2 className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold text-lg text-letus-black">영업소 포털 접속</div>
                                            <div className="text-xs text-slate-500 mt-0.5">영업소장 · 택배기사 · 시공팀 통합 로그인</div>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-letus-orange" />
                                    </div>


                                </div>
                            )}

                            {/* Admin text link — 항상 보임 (모드 선택 전) */}
                            {!mode && (
                                <div className="flex justify-end gap-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => setMode("region-admin")}
                                        className="text-xs text-slate-400 hover:text-blue-500 hover:underline transition-colors"
                                    >
                                        시공팀 권역장 접속
                                    </button>
                                    <span className="text-xs text-slate-300">|</span>
                                    <button
                                        type="button"
                                        onClick={() => setMode("admin")}
                                        className="text-xs text-slate-400 hover:text-letus-orange hover:underline transition-colors"
                                    >
                                        LETUS 관리자 접속
                                    </button>
                                </div>
                            )}

                            {/* Admin mode - LETUS 관리자 */}
                            {mode === "admin" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-letus-orange">🔒 LETUS 관리자 모드</span>
                                        <button type="button" onClick={() => setMode(null)} className="text-xs text-slate-400 hover:underline">
                                            ← 뒤로
                                        </button>
                                    </div>
                                    <div className="bg-slate-100 p-3 rounded-md text-sm text-slate-600">
                                        <span className="font-bold text-letus-orange">🔒 보안 접속</span><br />
                                        LETUS 관리자 전용 페이지입니다.
                                    </div>
                                    <Input
                                        type="password"
                                        placeholder="관리자 비밀번호 입력"
                                        value={adminPw}
                                        onChange={(e) => setAdminPw(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Region Admin mode - 권역장 */}
                            {mode === "region-admin" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-blue-500">🔒 권역장 전용 접속</span>
                                        <button type="button" onClick={() => { setMode(null); setRegionAdminCenter(""); setRegionAdminSubRegion(""); setRegionAdminPw(""); }} className="text-xs text-slate-400 hover:underline">
                                            ← 뒤로
                                        </button>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded-md text-sm text-slate-600">
                                        <span className="font-bold text-blue-500">🔒 권역장 전용 접속</span><br />
                                        센터와 영업소를 선택하고 4자리 비밀번호를 입력하세요.
                                    </div>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        value={regionAdminCenter}
                                        onChange={(e) => { setRegionAdminCenter(e.target.value); setRegionAdminSubRegion(""); }}
                                    >
                                        <option value="">센터 선택</option>
                                        {regions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        value={regionAdminSubRegion}
                                        onChange={(e) => setRegionAdminSubRegion(e.target.value)}
                                        disabled={!regionAdminCenter}
                                    >
                                        <option value="">영업소 선택</option>
                                        {regionAdminSubRegions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                    <Input
                                        type="password"
                                        placeholder="권역장 비밀번호 4자리"
                                        value={regionAdminPw}
                                        onChange={(e) => setRegionAdminPw(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                        maxLength={4}
                                        inputMode="numeric"
                                    />
                                </div>
                            )}

                            {/* Portal mode — 통합 로그인 폼 */}
                            {mode === "portal" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-letus-black">📋 영업소 포털 접속</span>
                                        <button type="button" onClick={() => setMode(null)} className="text-xs text-slate-400 hover:underline">
                                            ← 뒤로
                                        </button>
                                    </div>

                                    {/* 1. 소속 센터 */}
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        value={selectedRegion}
                                        onChange={(e) => { setSelectedRegion(e.target.value); setSelectedSubRegion(""); }}
                                    >
                                        <option value="">소속 센터 선택</option>
                                        {regions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>

                                    {/* 2. 소속 영업소 */}
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                        value={selectedSubRegion}
                                        onChange={(e) => setSelectedSubRegion(e.target.value)}
                                        disabled={!selectedRegion}
                                    >
                                        <option value="">소속 영업소 선택</option>
                                        {subRegions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>

                                    {/* 3. 구분 — 라디오 버튼 */}
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 mb-2 block">구분</label>
                                        <div className="flex gap-4">
                                            <label
                                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${userType === "manager"
                                                    ? "border-letus-orange bg-[#FFF5F2] text-letus-orange font-bold"
                                                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                                                    }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="userType"
                                                    value="manager"
                                                    checked={userType === "manager"}
                                                    onChange={() => setUserType("manager")}
                                                    className="accent-letus-orange"
                                                />
                                                영업소장
                                            </label>
                                            <label
                                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${userType === "driver"
                                                    ? "border-letus-orange bg-[#FFF5F2] text-letus-orange font-bold"
                                                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                                                    }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="userType"
                                                    value="driver"
                                                    checked={userType === "driver"}
                                                    onChange={() => setUserType("driver")}
                                                    className="accent-letus-orange"
                                                />
                                                택배기사
                                            </label>
                                        </div>
                                    </div>

                                    {/* 4. 이름/전화번호 */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input placeholder="성명" value={name} onChange={(e) => setName(e.target.value)} />
                                        <Input placeholder="전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                    </div>

                                    {/* 5. 생년월일 6자리 */}
                                    <Input
                                        placeholder="생년월일 6자리 (예: 901215)"
                                        value={birthday}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                                            setBirthday(v);
                                        }}
                                        maxLength={6}
                                        inputMode="numeric"
                                    />

                                    {/* 6. 영업소 PIN 코드 */}
                                    <Input
                                        type="password"
                                        placeholder="영업소 PIN 코드 (6자리)"
                                        value={pinCode}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                                            setPinCode(v);
                                        }}
                                        maxLength={6}
                                        inputMode="numeric"
                                    />
                                    <p className="text-[11px] text-slate-400 -mt-2">
                                        * PIN 코드는 영업소장에게 확인하세요.
                                    </p>
                                </div>
                            )}

                            {/* Submit button — 모드 선택한 경우만 표시 */}
                            {mode && (
                                <Button
                                    type="submit"
                                    className={`w-full h-12 text-base font-bold text-white shadow-lg transition-transform active:scale-95 ${
                                        mode === "region-admin" 
                                        ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" 
                                        : "bg-letus-orange hover:bg-letus-orange/90 shadow-letus-orange/20"
                                    }`}
                                    disabled={isLoggingIn}
                                >
                                    {isLoggingIn ? "접속 중..." : mode === "admin" ? "LETUS 관리자 입장" : mode === "region-admin" ? "권역장 대시보드 입장" : "시작하기"}
                                    {!isLoggingIn && <ChevronRight className="ml-2 h-4 w-4" />}
                                </Button>
                            )}
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
