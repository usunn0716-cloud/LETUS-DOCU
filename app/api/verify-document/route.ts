import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Anthropic 클라이언트 초기화
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(req: Request) {
    try {
        const { imageBase64, fileType, itemId, docTitle, userName, userPhone, userSubRegion } = await req.json();

        if (!process.env.ANTHROPIC_API_KEY) {
            console.error("ANTHROPIC_API_KEY is missing");
            return NextResponse.json({ error: "API Key missing" }, { status: 500 });
        }

        // 점검 대상 확인
        const targetIds = [
            "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12",
            "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"
        ];

        if (itemId && !targetIds.includes(itemId)) {
            console.log(`[OCR] Skipping ${docTitle} (${itemId}) - Not a target for AI verification`);
            return NextResponse.json({ skipped: true });
        }

        console.log(`[OCR] Starting verification for: ${docTitle || "Auto-Detection Mode"} (${itemId || "Bulk"})`);

        const getValidMediaType = (ft: string) => {
            if (ft === "image/png") return "image/png";
            if (ft === "image/webp") return "image/webp";
            if (ft === "image/gif") return "image/gif";
            return "image/jpeg";
        };

        // Claude 호출
        const response = await anthropic.messages.create({
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

## 2. 위수탁계약서 (m2, c1)
- 연락처, 이메일, 경력

## 3. 자동차등록증 (m7, c5)
- 차량종류: 서류상 "차종" 항목에서 추출 (예: 소형승합, 일반화물, 특수화물 등)
- 차량명: 서류상 "차명" 항목에서 추출 (예: 포터, 마이티QT 등)
- 차량번호: 서류상 "자동차등록번호" 항목에서 추출 (예: 경기12가3456)
- 연식: 서류상 "형식 및 제작연월" 항목에서 추출. 없으면 "확인불가" 반환.
- 연료종류: 서류상 제원 하위의 "연료의 종류" 항목에서 추출 (예: 경유, 휘발유, LPG 등). 없으면 "확인불가" 반환.
- 번호판종류: 서류상 "용도" 항목의 텍스트 추출 (영업용/관용/자가용)
- 적재함형태_적재량: 서류상 "최대적재량" 항목에서 추출. 없으면 "확인불가" 반환.
- 이산화탄소배출량: 서류상 "CO2배출량" 항목에서 추출. 없으면 "확인불가" 반환.

## 4. 화물운송종사 자격증 (m8, c6)
- 화물운송종사자격증번호: 서류상 "종사자격번호" 또는 "자격번호" 항목에서 추출
- 종사자격증취득일: 서류상 "취득일자", "발급일자", "자격취득일" 항목에서 추출

## 5. 사무실 임대(전대)차계약서 (m3)
- 임차인연락처

# ★★★ 서류 유형 판별 ★★★
${docTitle ? `사용자가 제출해야 하는 서류 유형은 "${docTitle}"입니다. 반드시 이미지에 표시된 서류가 실제로 "${docTitle}"인지 확인하십시오.` : `이 서류가 다음 중 어떤 것인지 먼저 분류하십시오: [사업자등록증, 위수탁계약서, 부속합의서, 사무실 임대(전대)차계약서, 사무실 전대차 동의서, 영업소 등기부등본, 자동차등록증, 운전면허증, 화물운송종사 자격증, 안전교육 이수증, 택배기사 명부, 산재보험가입증명원, 화물운송 허가증]`}

## 서류 유형 판별 기준:
- "사업자등록증" → 국세청 발급 사업자등록증. "사업자등록증명원"도 인정.
- "위수탁계약서" → 위·수탁 계약서. 갑↔을 당사자 구조에 주의.
- "부속합의서" → 위수탁계약에 부속하는 합의서.
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

## 불일치 시 즉시 반려:
만약 제출된 이미지가 "${docTitle}"이 아닌 다른 종류의 서류이거나, 서류가 아닌 일반 사진/이미지인 경우:
→ 즉시 반려 판정
→ rejection_reasons에 "제출하신 이미지는 '${docTitle}'이(가) 아닙니다. 올바른 서류를 다시 업로드해주세요." 추가

# 점검 대상 서류 및 세부 기준

## 서류: 위수탁계약서 (택배사업자↔영업소 / 영업소↔택배기사)
### 추출 항목: 갑/을 정보, 계약기간, 날인/서명, 연락처, 이메일, 경력
### 점검 기준:
- [필수] 계약기간 → 심사 당해연도(${new Date().getFullYear()}년) 또는 2025년 포함 여부
- [필수] 갑/을 날인란 또는 대표자 서명란 → 날인/서명 존재 여부
- [필수] 별지1(개인정보 수집·이용 동의서) → 체크박스 및 날인/서명 존재 여부
- [필수] 별지2(개인정보 제3자 제공 동의서) → 체크박스 및 날인/서명 존재 여부
- 미기재 시: 반려 → "미기재 항목 기재 후 재제출 필요"

## 서류: 부속합의서
### 점검 기준:
- [필수] 을(영업소장) 측 날인/서명 기재 여부 (갑 측 날인은 없어도 통과)
- [필수] 날짜 → 심사 당해연도 또는 2025년 포함 여부
- 미기재 시: 반려

## 서류: 사업자등록증
### 추출 항목: 상호, 성명, 등록번호, 개업연월일, 사업장 소재지, 업태, 종목
### 점검 기준:
- [필수] 업태/종목에 다음 중 1개 이상 포함: '화물 운송업', '운수 및 창고업', '운수업', '택배업', '용달', '화물'
- [참고] 발급일은 심사 기준에 포함하지 않음. 과거 발급분도 승인.

## 서류: 자동차등록증
### 추출 항목: 성명(명칭), 자동차등록번호, 용도, 소유자 주소, 차종, 차명, 형식및제작연월, 연료의종류, 최대적재량, CO2배출량
### 점검 기준:
- [필수] 문서 상단에 "자동차등록증" 글자 명확히 있어야 함
- [필수] 관할 관청의 도장날인 포함
- [필수] 성명(명칭) 또는 소유자 항목 → 택배기사명과 일치 여부
- [참고] 용도 항목 → '영업용' 또는 '자가용' 확인
- 개인정보(주민등록번호)는 존재 여부만 확인하고 추출하지 마십시오.

## 서류: 화물운송종사자격증
### 추출 항목: 성명, 화물운송종사자격증번호(종사자격번호), 종사자격증취득일(취득일자/발급일자)
### 점검 기준:
- [필수] 자격증 번호와 성명이 명확히 판독 가능해야 함
- [필수] 성명 항목 → 택배기사명과 일치 여부

## 서류: 운전면허증
### 추출 항목: 성명, 면허번호, 면허 종류, 적성검사(갱신) 기간, 주소, 생년월일
### 점검 기준:
- [필수] 이미지 상단에 "자동차운전면허증" 또는 "운전면허증" 글자 명확히 있어야 함
- [필수] 성명 항목 → 택배기사명과 일치 여부
- [필수] 적성검사 만료일 → 오늘 날짜 기준 초과 여부 (만료 시 반려)

## 서류: 산재보험가입증명원
### 점검 기준:
- [필수] 산재보험 체크 여부 확인
- [필수] 사업주(대표자) 성명 → 영업소장 이름과 일치 여부
- [필수] 발행일 → 심사 당해연도 발급 여부
- [필수] 근로복지공단 직인 존재 여부

## 서류: 안전교육 이수증
### 점검 기준:
- [필수] "수료증", "이수증" 또는 "안전교육" 관련 명칭 확인
- [필수] 교육이수자명 → 택배기사명과 일치 여부
- [참고] 발급일자는 심사 기준에 포함하지 않음.

## 서류: 화물운송허가증
### 점검 기준:
- [필수] 성명(대표자) → 택배기사명 또는 영업소장명과 일치 여부
- [필수] 관할 관청 직인 존재 여부

## 서류: 영업소 등기부등본
### 점검 기준:
- [필수] "등기사항전부증명서" 또는 "등기사항일부증명서" 명칭 필수
- [필수] 발급확인번호 및 발행일 → 심사 당해연도 발급 여부
- [필수] 관할 등기소 직인 존재 여부

## 서류: 영업소 임대(전대)차 계약서
### 점검 기준:
- [필수] 임대인/임차인 이름·주소 기재 여부
- [필수] 임대인/임차인 서명/날인란 → 날인 존재 여부

## 서류: 영업소 전대차 동의서
### 점검 기준:
- [필수] 위임자 또는 임대인 이름 기재 여부
- [필수] 임대인 서명/날인란 → 날인 존재 여부

## 서류: 택배기사 명부
### 점검 기준:
- [필수] 기사 성함, 전화번호 포함 여부

# 심사 당해연도 기준
- 심사 당해연도 = ${new Date().getFullYear()}년
- 위수탁계약서/부속합의서는 2025년도 계약도 승인 처리
- 사업자등록증/안전교육 이수증은 발급일 제한 없음
- 그 외 증명서류: 발급일이 당해연도 이내여야 함

# ★ 도장날인 및 서명 시각 인식 가이드 ★
## 도장날인 판별 기준:
- 빨간색/파란색 원형·타원형·사각형 마크가 "(인)" 근처에 있으면 → 도장날인 있음
- "(인)" 글자만 있고 아무런 마크 없으면 → 도장날인 없음
## 서명 판별 기준:
- "(인)" 근처에 손글씨 필기체 잉크 자국 → 서명 있음
- 어떠한 필기 흔적도 없으면 → 서명 없음
## 판정: 하나라도 존재하면 적합, 둘 다 없으면 반려

# 주의사항
1. 서류 유형이 불일치하면 무조건 반려.
2. 판독 불가 시 "확인불가" 표시 및 반려.
3. 개인정보(주민등록번호 등)는 존재 여부만 확인하고 추출 금지.
4. 도장/서명은 시각적(색상, 형태, 잉크 자국)으로 판단.
5. 오늘 날짜는 ${new Date().toLocaleDateString("ko-KR")} 입니다.

# 출력 형식: 반드시 JSON으로만 응답하십시오.
{
  "document_type": "서류 유형",
  "extracted_data": { "필드명": "추출값" },
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
                            text: `이 이미지가 "${docTitle}"인지 확인하고 분석해주세요. JSON으로만 응답하세요.`,
                        },
                    ] as any,
                },
            ],
        });

        const content = response.content[0];
        if (content.type !== "text") throw new Error("Unexpected response type");

        const resultJson = JSON.parse(content.text.match(/\{[\s\S]*\}/)![0]);

        // Google Sheets 기록 (비동기)
        if (resultJson && resultJson.extracted_data) {
            const { extracted_data, overall_result } = resultJson;
            import("@/lib/google-sheets").then(({ appendExtractedData, updateContactInSheet }) => {
                if (itemId === "m9" || itemId === "c7" || resultJson.document_type === "운전면허증") {
                    appendExtractedData("운전면허증", [userSubRegion, userName, userPhone, extracted_data.이름 || "", extracted_data.생년월일 || "", extracted_data.거주지주소 || "", extracted_data.운전면허종류 || "", extracted_data.운전면허번호 || "", overall_result]);
                } else if (itemId === "m2" || itemId === "c1" || resultJson.document_type === "위수탁계약서") {
                    appendExtractedData("위수탁계약서", [userSubRegion, userName, userPhone, extracted_data.연락처 || "", extracted_data.이메일 || "", extracted_data.경력 || "", overall_result]);
                } else if (itemId === "m7" || itemId === "c5" || resultJson.document_type === "자동차등록증") {
                    appendExtractedData("자동차등록증", [userSubRegion, userName, userPhone, extracted_data.차량종류 || extracted_data.차종 || "", extracted_data.차량명 || extracted_data.차명 || "", extracted_data.차량번호 || extracted_data.자동차등록번호 || "", extracted_data.연식 || extracted_data.형식및제작연월 || "", extracted_data.연료종류 || extracted_data.연료의종류 || "", extracted_data.번호판종류 || extracted_data.용도 || "", extracted_data.적재함형태_적재량 || extracted_data.최대적재량 || "", extracted_data.이산화탄소배출량 || "", overall_result]);
                } else if (itemId === "m8" || itemId === "c6" || resultJson.document_type === "화물운송종사자격증" || resultJson.document_type === "화물운송종사 자격증") {
                    appendExtractedData("화물운송종사 자격증", [userSubRegion, userName, userPhone, extracted_data.화물운송종사자격증번호 || extracted_data.자격증번호 || extracted_data.종사자격번호 || "", extracted_data.종사자격증취득일 || extracted_data.자격취득일 || extracted_data.취득일자 || "", overall_result]);
                } else if (itemId === "m3" || resultJson.document_type?.includes("임대")) {
                    // 임대차계약서에서 연락처 추출 → 위수탁계약서 시트의 같은 이름 행에 연락처 업데이트
                    const contact = extracted_data.임차인연락처 || extracted_data.연락처 || "";
                    if (contact && userName) {
                        updateContactInSheet(userName, contact);
                    }
                }
            }).catch(e => console.error("Sheets error:", e));
        }

        return NextResponse.json(resultJson);
    } catch (error: any) {
        console.error("[OCR] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
