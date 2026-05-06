import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: CLIENT_EMAIL,
        private_key: PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * 서류 유형별 시트 이름 및 헤더 정의
 */
const SHEET_CONFIG: Record<string, string[]> = {
    '운전면허증': [
        '제출일시', '영업소', '이름', '전화번호', 'OCR_이름', '생년월일', '거주지주소', '운전면허종류', '운전면허번호', '판정결과'
    ],
    '위수탁계약서': [
        '제출일시', '영업소', '이름', '전화번호', '연락처', '이메일', '경력', '판정결과'
    ],
    '자동차등록증': [
        '제출일시', '영업소', '이름', '전화번호', '차량종류', '차량명', '차량번호', '연식', '연료종류', '번호판종류(용도)', '적재함형태/적재량', '이산화탄소배출량', '판정결과'
    ],
    '화물운송종사 자격증': [
        '제출일시', '영업소', '이름', '전화번호', '화물운송종사자격증번호', '종사자격증취득일', '판정결과'
    ]
};

/**
 * itemId → 시트 이름 매핑
 */
const ITEM_TO_SHEET: Record<string, string> = {
    'm9': '운전면허증', 'c7': '운전면허증',
    'm2': '위수탁계약서', 'c1': '위수탁계약서',
    'm7': '자동차등록증', 'c5': '자동차등록증',
    'm8': '화물운송종사 자격증', 'c6': '화물운송종사 자격증',
};

/**
 * 시트 1행에 헤더가 없으면 자동으로 작성
 * - 1행이 비어있거나 SHEET_CONFIG의 헤더와 다르면 헤더를 덮어씀
 */
async function ensureHeaders(sheetName: string): Promise<void> {
    const headers = SHEET_CONFIG[sheetName];
    if (!headers) return;

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
        });
        const firstRow = res.data.values?.[0] || [];

        // 1행이 비어있거나, 첫 번째 셀이 헤더 첫 값과 다르면 헤더 작성
        if (firstRow.length === 0 || firstRow[0] !== headers[0]) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID!,
                range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [headers] },
            });
            console.log(`[Google Sheets] "${sheetName}" 시트에 헤더 1행 작성 완료`);
        }
    } catch {
        // 시트가 없거나 접근 실패 시 무시 (데이터 기록 시 에러 처리됨)
        console.warn(`[Google Sheets] "${sheetName}" 헤더 확인 실패 (시트 미존재 가능)`);
    }
}

/**
 * 기존 시트에서 동일 인물(이름+전화번호) 행 번호 찾기
 * - 모든 시트: 이름(C열) + 전화번호(D열) 기준 (로그인 정보 사용)
 * - 1행(헤더)은 건너뜀
 * @returns 찾은 행 번호 (1-indexed, 시트 기준) 또는 -1
 */
async function findExistingRow(sheetName: string, userName: string, userPhone: string): Promise<number> {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${sheetName}!A:D`,
        });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return -1; // 헤더만 있거나 비어있으면 -1

        // i=1부터 시작 (0번째는 헤더 행)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowName = (row[2] || '').toString().trim();  // C열 = 이름
            const rowPhone = (row[3] || '').toString().trim(); // D열 = 전화번호

            if (rowName === userName.trim() && rowPhone === userPhone.trim()) {
                return i + 1; // 1-indexed
            }
        }
        return -1;
    } catch {
        return -1;
    }
}

/**
 * 특정 시트에 데이터 추가 또는 덮어쓰기
 * - 1행에 헤더가 없으면 자동 생성
 * - 동일 인물이 이미 있으면 해당 행을 최신 데이터로 덮어쓰기
 * - 없으면 새 행 추가
 */
export async function appendExtractedData(sheetName: string, rowData: any[]) {
    if (!SPREADSHEET_ID || !(sheetName in SHEET_CONFIG)) return;

    try {
        // 1행 헤더 확인 및 자동 생성
        await ensureHeaders(sheetName);

        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const values = [[now, ...rowData]];

        // rowData[0] = 영업소, rowData[1] = 이름(로그인), rowData[2] = 전화번호(로그인)
        const userName = rowData[1] || '';
        const userPhone = rowData[2] || '';

        const existingRow = await findExistingRow(sheetName, userName, userPhone);

        if (existingRow > 0) {
            // 기존 행 덮어쓰기 (동일 이름+전화번호 → 최신 데이터로 갱신)
            const headers = SHEET_CONFIG[sheetName];
            const endCol = String.fromCharCode(64 + headers.length); // A=65
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A${existingRow}:${endCol}${existingRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });
            console.log(`[Google Sheets] Updated existing row ${existingRow} in "${sheetName}" for ${userName} (${userPhone})`);
        } else {
            // 새 행 추가
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });
            console.log(`[Google Sheets] Appended new row to "${sheetName}" for ${userName} (${userPhone})`);
        }
    } catch (error) {
        console.error(`[Google Sheets] Error writing to "${sheetName}":`, error);
    }
}

/**
 * 임대차계약서에서 추출한 연락처를 위수탁계약서 시트에 업데이트
 * - 이름(C열)이 일치하는 행을 찾아 연락처(E열)를 업데이트
 */
export async function updateContactInSheet(userName: string, contact: string) {
    if (!SPREADSHEET_ID || !userName || !contact) return;

    try {
        const sheetName = '위수탁계약서';
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:H`,
        });
        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log(`[Google Sheets] 위수탁계약서 시트에 데이터가 없어 연락처 업데이트 불가`);
            return;
        }

        for (let i = 0; i < rows.length; i++) {
            const rowName = (rows[i][2] || '').toString().trim(); // C열 = 이름
            if (rowName === userName.trim()) {
                // E열(연락처) 업데이트 (E = 5번째 열)
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!E${i + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[contact]] },
                });
                console.log(`[Google Sheets] 위수탁계약서 시트 ${i + 1}행 연락처 업데이트: ${userName} → ${contact}`);
                return;
            }
        }
        console.log(`[Google Sheets] 위수탁계약서 시트에서 "${userName}" 을 찾지 못함`);
    } catch (error) {
        console.error(`[Google Sheets] 연락처 업데이트 오류:`, error);
    }
}

/**
 * itemId로 해당하는 시트 이름 반환
 */
export function getSheetNameByItemId(itemId: string): string | null {
    return ITEM_TO_SHEET[itemId] || null;
}

/**
 * 서류 취소 시 해당 시트에서 행 삭제 (플랫폼-스프레드시트 동기화)
 * - 이름(C열) + 전화번호(D열) 기준으로 행을 찾아 물리적으로 삭제
 * - 빈 행이 남지 않고 완전히 제거됨
 */
export async function deleteSheetRow(sheetName: string, userName: string, userPhone: string): Promise<void> {
    if (!SPREADSHEET_ID || !userName || !userPhone) return;
    // SHEET_CONFIG에 없는 시트는 삭제 대상 아님
    if (!(sheetName in SHEET_CONFIG)) return;

    try {
        // 1. 행 찾기
        const rowIndex = await findExistingRow(sheetName, userName, userPhone);
        if (rowIndex <= 1) {
            console.log(`[Google Sheets] "${sheetName}"에서 ${userName}(${userPhone}) 행을 찾지 못함 — 삭제 생략`);
            return;
        }

        // 2. 시트의 sheetId 가져오기 (행 삭제 API에 필요)
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
            fields: 'sheets.properties',
        });
        const targetSheet = spreadsheet.data.sheets?.find(
            s => s.properties?.title === sheetName
        );
        if (targetSheet?.properties?.sheetId === undefined) {
            console.warn(`[Google Sheets] "${sheetName}" 시트의 sheetId를 찾을 수 없음`);
            return;
        }

        // 3. 행 물리적 삭제 (빈 행 없이 완전 제거)
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: targetSheet.properties.sheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1, // 0-indexed
                            endIndex: rowIndex,       // exclusive
                        }
                    }
                }]
            }
        });

        console.log(`[Google Sheets] "${sheetName}" ${rowIndex}행 삭제 완료: ${userName}(${userPhone})`);
    } catch (error) {
        console.error(`[Google Sheets] "${sheetName}" 행 삭제 오류:`, error);
    }
}
