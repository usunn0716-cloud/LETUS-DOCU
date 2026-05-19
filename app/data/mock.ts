import { DocumentItem, RegionalStat, User } from "../types";

// --- Document Checklists ---

export const MANAGER_CHECKLIST_TEMPLATE: DocumentItem[] = [
    { id: "m1", title: "사업자등록증", type: "image", required: true, status: "pending" },
    { id: "m2", title: "위수탁계약서", type: "image", required: true, status: "pending" },
    { id: "m2b", title: "부속합의서", type: "image", required: true, status: "pending" },
    { id: "m3", title: "사무실 임대(전대)차계약서", type: "image", required: true, status: "pending" },
    { id: "m4", title: "사무실 전대차 동의서", type: "image", required: false, status: "pending" },
    { id: "m5", title: "영업소 등기부등본", type: "image", required: true, status: "pending" },
    { id: "m6", title: "산재보험가입증명원", type: "image", required: true, status: "pending" },
    { id: "m7", title: "자동차등록증", type: "image", required: false, status: "pending" },
    { id: "m8", title: "화물운송종사 자격증", type: "image", required: false, status: "pending" },
    { id: "m9", title: "운전면허증", type: "image", required: false, status: "pending" },
    { id: "m10", title: "안전교육 이수증", type: "image", required: false, status: "pending" },
    { id: "m11", title: "화물운송 허가증", type: "image", required: true, status: "pending" },
    { id: "m12", title: "택배기사 명부", type: "image", required: true, status: "pending" },
    { id: "m13", title: "영업소 전경 사진", type: "image", required: true, status: "pending" },
];

export const COURIER_CHECKLIST_TEMPLATE: DocumentItem[] = [
    { id: "c1", title: "위수탁계약서", type: "image", required: true, status: "pending" },
    { id: "c1b", title: "부속합의서", type: "image", required: true, status: "pending" },
    { id: "c2", title: "사업자등록증", type: "image", required: true, status: "pending" },
    { id: "c3", title: "산재보험가입증명원", type: "image", required: true, status: "pending" },
    { id: "c4", title: "안전교육 이수증", type: "image", required: true, status: "pending" },
    { id: "c5", title: "자동차등록증", type: "image", required: true, status: "pending" },
    { id: "c6", title: "화물운송종사 자격증", type: "image", required: true, status: "pending" },
    { id: "c7", title: "운전면허증", type: "image", required: true, status: "pending" },
    { id: "c8", title: "화물운송 허가증", type: "image", required: true, status: "pending" },
];

// --- 서류별 업로드 안내 설명 ---
// 각 서류 ID에 대한 안내 문구. "따옴표" 안의 텍스트는 볼드+주황색으로 렌더링됨.

export interface DocDescriptionLine {
    text: string;  // 전체 텍스트 (이 안에 볼드 마커 포함)
}

export const DOCUMENT_DESCRIPTIONS: Record<string, DocDescriptionLine[]> = {
    // ── 영업소장 ──
    m1: [
        { text: '업태/종목 내 "화물운송, 운수업, 창고업, 택배, 늘찬 배달" 등이 반드시 포함' },
    ],
    m2: [
        { text: '"계약기간 최신화"' },
        { text: '문서 상 "체크박스 체크" 및 "서명란 날인" 필수' },
    ],
    m2b: [
        { text: '"계약기간 최신화"' },
        { text: '문서 상 "체크박스 체크" 및 "서명란 날인" 필수' },
    ],
    m3: [
        { text: '"계약기간 최신화"' },
        { text: '영업소(사무실)이 "임대, 전대"인 경우 필요' },
    ],
    m4: [
        { text: '"계약기간 최신화"' },
        { text: '영업소(사무실)이 "전대"인 경우 필요' },
    ],
    m5: [
        { text: '"심사 당해년도분" 발급' },
    ],
    m6: [
        { text: '"심사 당해년도분 발급"' },
    ],
    m7: [
        { text: '"영업소장이 배송 진행시" 업로드' },
        { text: '"차량 소유주 본인"일 경우 업로드' },
        { text: '법인/임대 차량은 리스 계약서 별도 구비 필요' },
    ],
    m8: [
        { text: '"영업소장이 배송 진행시" 업로드' },
        { text: '"자격증 소지자=운전자=택배기사명" 일치 여부 확인' },
    ],
    m9: [
        { text: '"영업소장이 배송 진행시" 업로드' },
        { text: '"자격증 소지자=운전자=택배기사명" 일치 여부 확인' },
        { text: '"유효기간 확인"' },
    ],
    m12: [
        { text: '"기사 성함, 전화번호" 기재 필요' },
    ],
    m13: [
        { text: '"실외, 실내 두 사진 모두 필요"' },
        { text: '실외: 외부 간판 또는 현관사진' },
        { text: '실내: 장비(PC, 프린터 등)가 포함된 사진' },
    ],

    // ── 택배기사 ──
    c1: [
        { text: '"계약기간 최신화"' },
        { text: '문서 상 "체크박스 체크" 및 "서명란 날인" 필수' },
    ],
    c1b: [
        { text: '"계약기간 최신화"' },
        { text: '문서 상 "체크박스 체크" 및 "서명란 날인" 필수' },
    ],
    c2: [
        { text: '업태/종목 내 "화물운송, 운수업, 창고업, 택배, 늘찬 배달" 등이 반드시 포함' },
    ],
    c3: [
        { text: '"심사 당해년도분 발급"' },
    ],
    c5: [
        { text: '"차량 소유주 본인"일 경우 업로드' },
        { text: '법인/임대 차량은 리스 계약서 별도 구비 필요' },
    ],
    c6: [
        { text: '"자격증 소지자와 운전자 일치 여부 확인"' },
    ],
    c7: [
        { text: '"운전자와 택배기사명 일치 여부 확인"' },
        { text: '"유효기간 확인"' },
    ],
    c8: [
        { text: '"영업용 번호판 보유시" 필요' },
    ],
};

// --- Real Regional Data ---

export const REGIONAL_DATA: RegionalStat[] = [
    // 양지센터 B2C
    { region: "양지센터(B2C)", subRegion: "양지6영업소((주)디에스엔지니어)", managerName: "정득수", stats: { total: 15, submitted: 12, rate: 80 } },
    { region: "양지센터(B2C)", subRegion: "양지7영업소((주)서현테크)", managerName: "전종규", stats: { total: 12, submitted: 5, rate: 41 } },
    { region: "양지센터(B2C)", subRegion: "양지8영업소(스타일룸)", managerName: "이동훈", stats: { total: 8, submitted: 8, rate: 100 } },
    { region: "양지센터(B2C)", subRegion: "양지12영업소(TY서비스)", managerName: "김태영", stats: { total: 10, submitted: 2, rate: 20 } },
    { region: "양지센터(B2C)", subRegion: "양지2_2영업소(엠케이프로젝트퍼니처)", managerName: "황원영", stats: { total: 6, submitted: 6, rate: 100 } },
    { region: "양지센터(B2C)", subRegion: "양지23영업소(일룸)", managerName: "신승민", stats: { total: 20, submitted: 15, rate: 75 } },
    { region: "양지센터(B2C)", subRegion: "양지13영업소", managerName: "강민섭", stats: { total: 5, submitted: 0, rate: 0 } },
    { region: "양지센터(B2C)", subRegion: "양지9영업소(그랑팩토리)", managerName: "신민혁", stats: { total: 9, submitted: 4, rate: 44 } },
    { region: "양지센터(B2C)", subRegion: "안성1영업소(유빈산업)", managerName: "이수완", stats: { total: 14, submitted: 10, rate: 71 } },
    { region: "양지센터(B2C)", subRegion: "양지22영업소(에이와이가구)", managerName: "김태안", stats: { total: 7, submitted: 3, rate: 42 } },
    { region: "양지센터(B2C)", subRegion: "양지2_1영업소(요다프렌즈)", managerName: "이승민", stats: { total: 11, submitted: 8, rate: 72 } },

    // 양지센터 B2B
    { region: "양지센터(B2B)", subRegion: "양지14영업소(LHS)", managerName: "이현석", stats: { total: 20, submitted: 18, rate: 90 } },
    { region: "양지센터(B2B)", subRegion: "양지15영업소(CMS 프로모션)", managerName: "이정일", stats: { total: 15, submitted: 5, rate: 33 } },
    { region: "양지센터(B2B)", subRegion: "양지16영업소(오성)", managerName: "손대만", stats: { total: 12, submitted: 12, rate: 100 } },
    { region: "양지센터(B2B)", subRegion: "양지17영업소(온찬유통)", managerName: "신승현", stats: { total: 10, submitted: 9, rate: 90 } },
    { region: "양지센터(B2B)", subRegion: "양지18영업소(모든퍼니처)", managerName: "김현섭", stats: { total: 8, submitted: 1, rate: 12 } },
    { region: "양지센터(B2B)", subRegion: "양지19영업소(드래곤)", managerName: "김용훈", stats: { total: 16, submitted: 8, rate: 50 } },
    { region: "양지센터(B2B)", subRegion: "양지20영업소(정인유통)", managerName: "김정훈", stats: { total: 14, submitted: 12, rate: 85 } },

    // 지방센터 (통합)
    { region: "지방센터", subRegion: "부산1영업소(태인유통)", managerName: "김태호", stats: { total: 25, submitted: 20, rate: 80 } },
    { region: "지방센터", subRegion: "부산(기장)2영업소(태준유통)", managerName: "구본준", stats: { total: 18, submitted: 6, rate: 33 } },
    { region: "지방센터", subRegion: "전남1영업소(스마일유통)", managerName: "윤성민", stats: { total: 12, submitted: 12, rate: 100 } },
    { region: "지방센터", subRegion: "창원1영업소(정빈유통)", managerName: "권재균", stats: { total: 15, submitted: 10, rate: 66 } },
    { region: "지방센터", subRegion: "울산1영업소(수연유통)", managerName: "임성현", stats: { total: 14, submitted: 7, rate: 50 } },
    { region: "지방센터", subRegion: "제주1영업소(스마일유통)", managerName: "윤성민", stats: { total: 8, submitted: 2, rate: 25 } },

    // 대구센터
    { region: "대구센터", subRegion: "대구1영업소(투윈스)", managerName: "임재복", stats: { total: 22, submitted: 20, rate: 90 } },
    { region: "대구센터", subRegion: "대구2영업소(대구가구)", managerName: "이찬희", stats: { total: 18, submitted: 15, rate: 83 } },
    { region: "대구센터", subRegion: "대구3영업소(형제유통)", managerName: "신종화", stats: { total: 12, submitted: 4, rate: 33 } },
    { region: "대구센터", subRegion: "대구4영업소(석퍼시스)", managerName: "백명석", stats: { total: 10, submitted: 10, rate: 100 } },

    // 대전센터
    { region: "대전센터", subRegion: "대전1영업소(주식회사오제이더블유)", managerName: "오진우", stats: { total: 20, submitted: 5, rate: 25 } },
    { region: "대전센터", subRegion: "대전2영업소(주식회사에스엔티)", managerName: "김기진", stats: { total: 15, submitted: 14, rate: 93 } },
    { region: "대전센터", subRegion: "대전3영업소(주식회사티오피플랜)", managerName: "김경진", stats: { total: 12, submitted: 6, rate: 50 } },
    { region: "대전센터", subRegion: "대전4영업소(무빙인)", managerName: "최재강", stats: { total: 18, submitted: 18, rate: 100 } },
    { region: "대전센터", subRegion: "대전5영업소(비비디)", managerName: "김태성", stats: { total: 16, submitted: 8, rate: 50 } },

    // 광주센터
    { region: "광주센터", subRegion: "광주1영업소(주식회사와이에스유통)", managerName: "김영삼", stats: { total: 25, submitted: 20, rate: 80 } },
    { region: "광주센터", subRegion: "광주2영업소(FIT퍼니처)", managerName: "김재랑", stats: { total: 20, submitted: 10, rate: 50 } },
    { region: "광주센터", subRegion: "전북1영업소(대영)", managerName: "김민상", stats: { total: 15, submitted: 15, rate: 100 } },
];
