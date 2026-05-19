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
        '제출일시', '영업소', '이름', '전화번호', 'OCR_이름', '생년월일', '거주지주소', '운전면허종류', '운전면허번호', '판정결과', '데이터소스', '원본파일링크', '고유키'
    ],
    '위수탁계약서': [
        '제출일시', '영업소', '이름', '전화번호', '연락처', '이메일', '경력', '판정결과', '데이터소스', '원본파일링크', '고유키'
    ],
    '자동차등록증': [
        '제출일시', '영업소', '이름', '전화번호', '차량종류', '차량명', '차량번호', '연식', '연료종류', '번호판종류(용도)', '적재함형태/적재량', '이산화탄소배출량', '판정결과', '데이터소스', '원본파일링크', '고유키'
    ],
    '화물운송종사 자격증': [
        '제출일시', '영업소', '이름', '전화번호', '화물운송종사자격증번호', '종사자격증취득일', '판정결과', '데이터소스', '원본파일링크', '고유키'
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
 * 기존 시트에서 동일 인물(고유키) 행 번호 찾기
 * - 1행(헤더)은 건너뜀
 * @returns 찾은 행 번호 (1-indexed, 시트 기준) 또는 -1
 */
async function findExistingRow(sheetName: string, uniqueKey: string): Promise<number> {
    try {
        const headers = SHEET_CONFIG[sheetName];
        if (!headers) return -1;
        
        const endCol = String.fromCharCode(64 + headers.length);
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${sheetName}!A:${endCol}`,
        });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return -1;

        const uniqueKeyColIdx = headers.length - 1;

        for (let i = 1; i < rows.length; i++) {
            const rowKey = (rows[i][uniqueKeyColIdx] || '').toString().trim();
            if (rowKey === uniqueKey.trim()) {
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
 * - 고유키가 동일한 행이 있으면 최신 데이터로 덮어쓰기
 * - 없으면 새 행 추가
 */
export async function appendExtractedData(sheetName: string, rowData: any[], fileUrl?: string, dataSource?: string, userBirthday?: string) {
    if (!SPREADSHEET_ID || !(sheetName in SHEET_CONFIG)) return;

    try {
        // 1행 헤더 확인 및 자동 생성
        await ensureHeaders(sheetName);

        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        
        // rowData[0] = 영업소, rowData[1] = 이름(로그인), rowData[2] = 전화번호(로그인)
        const subRegion = rowData[0] || '';
        const userName = rowData[1] || '';
        const userPhone = rowData[2] || '';
        const birthday = userBirthday || '생년월일미상';
        
        // 고유키 생성: 이름-전화번호-영업소-생년월일-서류명
        const uniqueKey = `${userName}-${userPhone}-${subRegion}-${birthday}-${sheetName}`;

        // 데이터소스 + 원본파일링크 + 고유키 추가
        const finalRow = [...rowData, dataSource || 'OCR', fileUrl || '', uniqueKey];
        const values = [[now, ...finalRow]];

        const existingRow = await findExistingRow(sheetName, uniqueKey);

        if (existingRow > 0) {
            // 기존 행 덮어쓰기
            const headers = SHEET_CONFIG[sheetName];
            const endCol = String.fromCharCode(64 + headers.length);
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A${existingRow}:${endCol}${existingRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });
            console.log(`[Google Sheets] Updated existing row ${existingRow} in "${sheetName}" for ${uniqueKey}`);
        } else {
            // 새 행 추가
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });
            console.log(`[Google Sheets] Appended new row to "${sheetName}" for ${uniqueKey}`);
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
 * - 고유키 기준으로 행을 찾아 물리적으로 삭제
 */
export async function deleteSheetRow(sheetName: string, userName: string, userPhone: string, subRegion: string, userBirthday: string): Promise<void> {
    if (!SPREADSHEET_ID || !userName || !userPhone || !subRegion) return;
    if (!(sheetName in SHEET_CONFIG)) return;

    try {
        const birthday = userBirthday || '생년월일미상';
        const uniqueKey = `${userName}-${userPhone}-${subRegion}-${birthday}-${sheetName}`;

        const rowIndex = await findExistingRow(sheetName, uniqueKey);
        if (rowIndex <= 1) {
            console.log(`[Google Sheets] "${sheetName}"에서 ${uniqueKey} 행을 찾지 못함 — 삭제 생략`);
            return;
        }

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

        console.log(`[Google Sheets] "${sheetName}" ${rowIndex}행 삭제 완료: ${uniqueKey}`);
    } catch (error) {
        console.error(`[Google Sheets] "${sheetName}" 행 삭제 오류:`, error);
    }
}

/**
 * 모든 서류 시트의 데이터 일괄 삭제 (전체 초기화용)
 * 헤더 행(1행)은 유지하고 A2부터 데이터만 지웁니다.
 */
export async function clearAllSheetData(): Promise<void> {
    if (!SPREADSHEET_ID) return;

    try {
        const sheetNames = Object.keys(SHEET_CONFIG);
        const ranges = sheetNames.map(sheetName => {
            const headers = SHEET_CONFIG[sheetName];
            const endCol = String.fromCharCode(64 + headers.length);
            return `${sheetName}!A2:${endCol}`;
        });

        await sheets.spreadsheets.values.batchClear({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                ranges: ranges,
            }
        });

        console.log(`[Google Sheets] 모든 서류 시트 데이터 일괄 초기화 완료 (헤더 유지)`);
    } catch (error) {
        console.error(`[Google Sheets] 시트 데이터 일괄 초기화 오류:`, error);
    }
}
