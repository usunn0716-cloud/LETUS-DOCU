import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Anthropic 클라이언트 초기화
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(req: Request) {
    try {
        // [수정] role, userRegion 추가 수신
        const { imageBase64, fileType, itemId, docTitle, userName, userPhone, userSubRegion, userBirthday, userRegion, role, fileUrl: uploadedFileUrl } = await req.json();

        if (!process.env.ANTHROPIC_API_KEY) {
            console.error("ANTHROPIC_API_KEY is missing");
            return NextResponse.json({ error: "API Key missing" }, { status: 500 });
        }

        // 점검 대상 확인
        const targetIds = [
            "m1", "m2", "m2b", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12",
            "c1", "c1b", "c2", "c3", "c4", "c5", "c6", "c7", "c8"
        ];

        if (itemId && !targetIds.includes(itemId)) {
            console.log(`[OCR] Skipping ${docTitle} (${itemId}) - Not a target for AI verification`);
            return NextResponse.json({ skipped: true });
        }

        console.log(`[OCR] Starting verification for: ${docTitle || "Auto-Detection Mode"} (${itemId || "Bulk"}) [role=${role || 'unknown'}]`);

        const getValidMediaType = (ft: string) => {
            if (ft === "image/png") return "image/png";
            if (ft === "image/webp") return "image/webp";
            if (ft === "image/gif") return "image/gif";
            return "image/jpeg";
        };

        // Claude 호출 (재시도 로직)
        const maxRetries = 3;
        let attempt = 0;
        let response;

        while (attempt < maxRetries) {
            try {
                response = await anthropic.messages.create({
                    model: "claude-sonnet-4-6",
                    max_tokens: 4000,
                    system: `당신은 택배 영업점의 서류 점검 담당자입니다.
택배기사 신규 계약 시 제출되는 서류를 검토하여 적합/반려 판정을 내립니다.

# 역할
- 제출된 서류 이미지를 OCR하여 핵심 정보를 추출합니다.
- 아래 점검 기준에 따라 각 서류의 적합 여부를 판정합니다.
- 반려 사유가 있으면 구체적으로 안내합니다.

# ★★★ 중요: 추출 데이터 필드 가이드 ★★★
다음 서류의 경우, extracted_data에 반드시 아래 필드명으로 데이터를 포함하십시오.

## 1. 운전면허증 (m9, c7)
- 이름, 생년월일, 거주지주소, 운전면허종류, 운전면허번호

## 2. 자동차등록증 (m7, c5)
- 차량종류: 서류상 "차종" 항목에서 추출 (예: 소형승합, 일반화물, 특수화물 등)
- 차량명: 서류상 "차명" 항목에서 추출 (예: 포터, 마이티QT 등)
- 차량번호: 서류상 "자동차등록번호" 항목에서 추출 (예: 경기12가3456)
- 연식: 서류상 "형식 및 제작연월" 항목에서 추출. 없으면 "확인불가" 반환.
- 연료종류: 서류상 제원 하위의 "연료의 종류" 항목에서 추출 (예: 경유, 휘발유, LPG 등). 없으면 "확인불가" 반환.
- 번호판종류: 서류상 "용도" 항목의 텍스트 추출 (영업용/관용/자가용)
- 적재함형태_적재량: 서류상 "최대적재량" 항목에서 추출. 없으면 "확인불가" 반환.
- 이산화탄소배출량: 서류상 "CO2배출량" 항목에서 추출. 없으면 "확인불가" 반환.

## 3. 화물운송종사 자격증 (m8, c6)
- 화물운송종사자격증번호: 서류상 "종사자격번호" 또는 "자격번호" 항목에서 추출
- 종사자격증취득일: 서류상 "취득일자", "발급일자", "자격취득일" 항목에서 추출

# ★★★ 서류 유형 판별 ★★★
${docTitle ? `사용자가 제출해야 하는 서류 유형은 "${docTitle}"입니다. 반드시 이미지에 표시된 서류가 실제로 "${docTitle}"인지 확인하십시오.` : `이 서류가 다음 중 어떤 것인지 먼저 분류하십시오: [사업자등록증, 위수탁계약서, 부속합의서, 사무실 임대(전대)차계약서, 사무실 전대차 동의서, 영업소 등기부등본, 자동차등록증, 운전면허증, 화물운송종사 자격증, 안전교육 이수증, 택배기사 명부, 산재보험가입증명원, 화물운송 허가증]`}

## 서류 유형 판별 기준:
- "사업자등록증" → 국세청 발급 사업자등록증. "사업자등록증명원"도 인정.
- "위수탁계약서" → 위·수탁 계약서. 제목에 "위수탁" 또는 "위·수탁"이 포함되고, 갑(본사)↔을(영업소장) 당사자 구조의 본계약서. 보통 여러 페이지에 걸쳐 계약 조항이 나열됨. ★ "부속합의서"가 아님!
- "부속합의서" → 제목에 반드시 "부속합의서" 또는 "부속 합의서"가 포함된 별도 문서. 본계약(위수탁계약서)에 부속하는 짧은 보충 합의서. 보통 1~2페이지이며 추가 합의 조건만 명시. ★ "위수탁계약서"와는 별개의 독립 서류로 분류해야 함!
- "사무실 임대(전대)차계약서" → 임대차 또는 전대차 계약서.
- "사무실 전대차 동의서" → 임대인이 전대를 동의하는 문서.
- "영업소 등기부등본" → 법원/인터넷등기소 발급 등기사항증명서.
- "자동차등록증" → 자동차등록번호, 소유자, 용도 등이 기재된 차량 등록 문서.
- "운전면허증" → 도로교통공단 발급 운전면허증.
- "화물운송종사 자격증" → 한국교통안전공단 발급 화물운송 종사자격증.
- "안전교육 이수증" → "교육 실시확인서" 또는 "안전교육 이수증".
- "택배기사 명부" → 택배기사들의 이름/연락처가 정리된 명부.
- "산재보험가입증명원" → 근로복지공단 발급 보험가입증명원.
- "화물운송 허가증" → "화물자동차 운송사업 허가증" 제목의 관할 관청 발급 문서.

★★★ 위수탁계약서 vs 부속합의서 구분 주의 ★★★
이 두 서류는 반드시 별도로 분류해야 합니다:
- 서류 제목/헤더에 "부속합의서" 또는 "부속 합의서"가 포함되어 있으면 → document_type을 반드시 "부속합의서"로 지정
- 서류 제목/헤더에 "위수탁" 또는 "위·수탁"이 포함되고 "부속합의서"가 아닌 경우에만 → "위수탁계약서"로 지정
- 절대로 부속합의서를 위수탁계약서로 분류하지 마십시오!

## 불일치 시 즉시 반려:
만약 제출된 이미지가 "${docTitle}"이 아닌 다른 종류의 서류이거나, 서류가 아닌 일반 사진/이미지인 경우:
→ 즉시 반려 판정
→ rejection_reasons에 "제출하신 이미지는 '${docTitle}'이(가) 아닙니다. 올바른 서류를 다시 업로드해주세요." 추가

# 점검 대상 서류 및 세부 기준

## 서류: 위수탁계약서
### 판별: 제목에 "위수탁 계약서" 또는 "위·수탁 계약서"가 있고, "부속합의서"가 아닌 본계약서
### 점검 기준:
- [필수] 계약기간 → 심사 당해연도(${new Date().getFullYear()}년) 또는 2025년 포함 여부
- [필수] 갑/을 날인란 또는 대표자 서명란 → 날인/서명 존재 여부
- [필수] 별지1(개인정보 수집·이용 동의서) → 체크박스 및 날인/서명 존재 여부
- [필수] 별지2(개인정보 제3자 제공 동의서) → 체크박스 및 날인/서명 존재 여부

## 서류: 부속합의서
### 판별: 제목에 "부속합의서" 또는 "부속 합의서"가 명시된 보충 합의 문서
### 점검 기준:
- [필수] 을(영업소장) 측 날인/서명 기재 여부
- [필수] 날짜 → 심사 당해연도 또는 2025년 포함 여부

## 서류: 사업자등록증
### 점검 기준:
- [필수] 업태/종목에 '화물 운송업', '운수 및 창고업', '운수업', '택배업', '용달', '화물' 중 1개 이상 포함

## 서류: 자동차등록증
### 점검 기준:
- [필수] "자동차등록증" 글자 명확히 있어야 함
- [필수] 관할 관청 도장날인 포함
- [필수] 소유자 → 택배기사명과 일치 여부

## 서류: 화물운송종사자격증
### 점검 기준:
- [필수] 자격증 번호와 성명이 판독 가능해야 함
- [필수] 성명 → 택배기사명과 일치 여부

## 서류: 운전면허증
### 점검 기준:
- [필수] "운전면허증" 글자 명확히 있어야 함
- [필수] 성명 → 택배기사명과 일치 여부
- [필수] 적성검사 만료일 → 미초과 여부

## 서류: 산재보험가입증명원
### 점검 기준:
- [필수] 산재보험 체크, 대표자 성명, 당해연도 발급, 근로복지공단 직인

## 서류: 안전교육 이수증
### 점검 기준:
- [필수] "수료/이수" 명칭, 교육이수자명 → 택배기사명 일치

## 서류: 화물운송허가증
### 점검 기준:
- [필수] 대표자 성명, 관할 관청 직인

## 서류: 영업소 등기부등본
### 점검 기준:
- [필수] "등기사항증명서" 명칭, 당해연도 발급, 등기소 직인

## 서류: 영업소 임대(전대)차 계약서
### 점검 기준:
- [필수] 임대인/임차인 이름·주소, 날인

## 서류: 영업소 전대차 동의서
### 점검 기준:
- [필수] 임대인 이름, 날인

## 서류: 택배기사 명부
### 점검 기준:
- [필수] 기사 성함+전화번호 포함

# 심사 당해연도 기준
- 심사 당해연도 = ${new Date().getFullYear()}년
- 위수탁계약서/부속합의서는 2025년도 계약도 승인
- 사업자등록증/안전교육 이수증은 발급일 제한 없음
- 그 외: 당해연도 이내

# ★ 도장날인 및 서명 판별 ★
- 빨간색/파란색 마크가 "(인)" 근처 → 도장날인 있음
- 손글씨 잉크 자국 → 서명 있음
- 둘 다 없으면 → 반려

# 주의사항
1. 서류 유형 불일치 → 무조건 반려
2. 판독 불가 → "확인불가" 표시 및 반려
3. 주민등록번호 → 존재 여부만 확인, 추출 금지
4. 오늘 날짜: ${new Date().toLocaleDateString("ko-KR")}

# 출력 형식: JSON만 응답
{
  "document_type": "서류 유형",
  "extracted_data": { "필드명": "추출값" },
  "extraction_status": { "필드명": "success/failed" },
  "inspection_results": [ { "check_item": "항목명", "result": "적합/반려/확인불가", "detail": "내용" } ],
  "overall_result": "적합/반려",
  "rejection_reasons": ["사유1"],
  "guidance_message": "안내 메시지"
}`,
                    messages: [
                        {
                            role: "user",
                            content: [
                                (fileType === "application/pdf" || imageBase64?.includes("pdf"))
                                    ? {
                                        type: "document",
                                        source: {
                                            type: "base64",
                                            media_type: "application/pdf",
                                            data: imageBase64.split(",")[1] || imageBase64,
                                        }
                                    }
                                    : {
                                        type: "image",
                                        source: {
                                            type: "base64",
                                            media_type: getValidMediaType(fileType || ""),
                                            data: imageBase64?.split(",")[1] || imageBase64,
                                        }
                                    },
                                {
                                    type: "text",
                                    text: `이 이미지가 "${docTitle || '지정된 서류'}"인지 확인하고 분석해 주세요. 
반드시 서류상의 [성명/소유자/대상자 이름]이 로그인한 기사명인 "${userName || ''}"와 일치하는지 비교하여 판정해 주세요. 
이름이 일치하지 않거나 누락된 경우, 전체 결과(overall_result)를 반드시 "반려"로 지정하고 rejection_reasons에 "서류의 이름(${userName || ''})과 제출된 서류상의 이름이 일치하지 않습니다."를 명확히 추가해 주세요.
JSON으로만 응답하세요.`,
                                },
                            ] as any,
                        },
                    ],
                });
                break;
            } catch (error: any) {
                attempt++;
                if (error.status === 529 || error.status === 429 || (error.error && error.error.type === 'overloaded_error')) {
                    console.log(`[OCR] Anthropic API Overloaded (529). Retrying... (${attempt}/${maxRetries})`);
                    if (attempt >= maxRetries) {
                        return NextResponse.json({
                            error: "현재 AI 검증 서버(Claude)에 일시적으로 요청이 폭주하여 과부하 상태입니다. 약 1분 후 다시 업로드해 주세요.",
                            status: 529
                        }, { status: 529 });
                    }
                    const delay = attempt * 3000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }

        if (!response) {
            throw new Error("API 응답이 없습니다.");
        }

        const content = response.content[0];
        if (content.type !== "text") throw new Error("Unexpected response type");

        const resultJson = JSON.parse(content.text.match(/\{[\s\S]*\}/)![0]);

        // ===== Google Sheets 기록 (비동기) =====
        if (resultJson && resultJson.extracted_data) {
            const { extracted_data, document_type } = resultJson;
            const rawDocType = document_type || "";
            const stripped = rawDocType.replace(/\s+/g, "").replace(/·/g, "");
            let docTypeToUse = stripped.includes("자동차등록증") ? "자동차등록증"
                : stripped.includes("운전면허증") ? "운전면허증"
                : (stripped.includes("화물운송") && stripped.includes("자격")) ? "화물운송종사 자격증"
                : stripped.includes("부속합의") ? "부속합의서"
                : (stripped.includes("위수탁") && stripped.includes("계약")) ? "위수탁계약서"
                : stripped.includes("사업자등록") ? "사업자등록증"
                : (stripped.includes("임대차") || stripped.includes("전대차계약")) ? "임대차계약서"
                : (stripped.includes("전대차") && stripped.includes("동의")) ? "사무실 전대차 동의서"
                : (stripped.includes("등기부") || stripped.includes("등기사항")) ? "영업소 등기부등본"
                : (stripped.includes("산재보험") || stripped.includes("보험가입증명")) ? "산재보험가입증명원"
                : (stripped.includes("안전교육") || stripped.includes("교육실시")) ? "안전교육 이수증"
                : (stripped.includes("화물운송") && stripped.includes("허가")) ? "화물운송 허가증"
                : (stripped.includes("택배기사") && stripped.includes("명부")) ? "택배기사 명부"
                : rawDocType;
            if (!docTypeToUse) {
                if (itemId === "m9" || itemId === "c7") docTypeToUse = "운전면허증";
                else if (itemId === "m7" || itemId === "c5") docTypeToUse = "자동차등록증";
                else if (itemId === "m8" || itemId === "c6") docTypeToUse = "화물운송종사 자격증";
                else if (itemId === "m2" || itemId === "c1") docTypeToUse = "위수탁계약서";
                else if (itemId === "m2b" || itemId === "c1b") docTypeToUse = "부속합의서";
            }

            if (docTypeToUse) {
                // [수정] role, center, subRegion을 함께 전달하여 올바른 시트에 기록
                import("@/lib/googleSheetsConstruction").then(({ updateOCRData }) => {
                    updateOCRData({
                        name: userName,
                        birthday: userBirthday,
                        phone: userPhone,
                        docType: docTypeToUse,
                        extractedData: extracted_data,
                        role: role || undefined,
                        center: userRegion || userSubRegion || '',
                        subRegion: userSubRegion || '',
                    });
                }).catch(e => console.error("Sheets OCR update error:", e));
            }
        }

        return NextResponse.json(resultJson);
    } catch (error: any) {
        console.error("[OCR] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}