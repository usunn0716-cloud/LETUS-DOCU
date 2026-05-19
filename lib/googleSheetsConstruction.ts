import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_CONSTRUCTION_ID;
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

// ===== 시공팀 등록 현황 시트 (권역장 / 택배기사 분리) =====
const COMMON_HEADERS = [
    '제출일시', '소속센터', '소속영업소', '이름', '생년월일', '연락처', '이메일', '주소',
    '차명', '차량번호', '연료', '차량형태', '번호판구분', '번호판종류(용도)', '이산화탄소배출량',
    '화물운송종사자격증번호', '종사자격증 취득일', '적재함형태/적재량', '운전면허종류', '운전면허번호',
    '상태'
];

const MANAGER_DOCS = [
    '사업자등록증', '위수탁계약서', '부속합의서', '사무실 임대(전대)차계약서', '사무실 전대차 동의서',
    '영업소 등기부등본', '산재보험가입증명원', '자동차등록증', '화물운송종사 자격증', '운전면허증',
    '안전교육 이수증', '화물운송 허가증', '택배기사 명부', '영업소 전경 사진'
];

const DRIVER_DOCS = [
    '위수탁계약서 및 부속합의서', '사업자등록증', '산재보험가입증명원', '안전교육 이수증',
    '자동차등록증', '화물운송종사 자격증', '운전면허증', '화물운송 허가증'
];

export const MANAGER_HEADERS = [...COMMON_HEADERS, ...MANAGER_DOCS.map(d => `서류링크_${d}`)];
export const DRIVER_HEADERS = [...COMMON_HEADERS, ...DRIVER_DOCS.map(d => `서류링크_${d}`)];

export function getSheetName(role?: string): string {
    if (role === 'manager') return '권역장등록현황';
    return '시공팀등록현황';
}

export function getHeaders(role?: string): string[] {
    if (role === 'manager') return MANAGER_HEADERS;
    return DRIVER_HEADERS;
}

// ===== 권역장 비밀번호 시트 =====
const PASSWORD_SHEET = '권역장비밀번호';

// ===== 유틸리티 =====
function colLetter(index: number): string {
    if (index < 26) return String.fromCharCode(65 + index);
    return 'A' + String.fromCharCode(65 + (index - 26));
}

async function updateCells(
    sheetName: string,
    row: number,
    updates: { col: string; value: string }[]
): Promise<void> {
    if (!SPREADSHEET_ID || updates.length === 0) return;
    const data = updates.map(u => ({
        range: `${sheetName}!${u.col}${row}`,
        values: [[u.value]],
    }));
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
}

async function updateCellsRaw(
    sheetName: string,
    row: number,
    updates: { col: string; value: string }[]
): Promise<void> {
    if (!SPREADSHEET_ID || updates.length === 0) return;
    const data = updates.map(u => ({
        range: `${sheetName}!${u.col}${row}`,
        values: [[u.value]],
    }));
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data },
    });
}

// ===== 헤더 확인 및 시트 생성 =====
async function ensureSheet(sheetName: string, headers: string[]): Promise<void> {
    if (!SPREADSHEET_ID) return;
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1:BZ1`,
        });
        const firstRow = res.data.values?.[0] || [];
        if (firstRow.length < headers.length || firstRow.slice(0, headers.length).join(',') !== headers.join(',')) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1:${colLetter(headers.length - 1)}1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [headers] },
            });
        }
    } catch {
        try {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }]
                }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1:${colLetter(headers.length - 1)}1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [headers] },
            });
        } catch (innerError) {
            console.error(`[Construction Sheets] "${sheetName}" 시트 생성 실패:`, innerError);
        }
    }
}

// ===== 동일인 행 찾기 =====
function normalizeDigits(val: string): string {
    return val.replace(/\D/g, '').replace(/^0+/, '');
}

async function findExistingRow(sheetName: string, name: string, birthday: string, phone: string): Promise<number> {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${sheetName}!D:F`,
        });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return -1;

        const inputName = name.trim();
        const inputBirth = normalizeDigits(birthday);
        const inputPhone = normalizeDigits(phone);

        for (let i = 1; i < rows.length; i++) {
            const rName = (rows[i][0] || '').toString().trim();
            const rBirth = normalizeDigits((rows[i][1] || '').toString());
            const rPhone = normalizeDigits((rows[i][2] || '').toString());

            const birthMatches = rBirth === inputBirth ||
                (rBirth.length === 8 && inputBirth.length === 6 && rBirth.endsWith(inputBirth)) ||
                (rBirth.length === 6 && inputBirth.length === 8 && inputBirth.endsWith(rBirth));

            if (rName === inputName && birthMatches && rPhone === inputPhone) {
                return i + 1;
            }
        }
        return -1;
    } catch {
        return -1;
    }
}

// ===== [헬퍼] 행이 없으면 자동 생성 후 행 번호 반환 =====
async function ensureUserRow(data: {
    name: string; birthday: string; phone: string;
    center?: string; subRegion?: string; role?: string;
}): Promise<number> {
    const sheetName = getSheetName(data.role);
    const headers = getHeaders(data.role);
    await ensureSheet(sheetName, headers);

    let row = await findExistingRow(sheetName, data.name, data.birthday, data.phone);
    if (row > 0) return row;

    // 행이 없으면 새로 생성
    console.log(`[Construction Sheets] 사용자 행 자동 생성: ${data.name}`);
    await savePersonalInfo({
        name: data.name,
        birthday: data.birthday,
        phone: data.phone,
        center: data.center || '',
        subRegion: data.subRegion || '',
        role: data.role,
    });

    row = await findExistingRow(sheetName, data.name, data.birthday, data.phone);
    if (row <= 0) {
        console.error(`[Construction Sheets] 행 생성 후에도 찾을 수 없음: ${data.name}`);
    }
    return row;
}

// ===== 개인정보 저장 =====
export async function savePersonalInfo(data: any) {
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not set");
    const sheetName = getSheetName(data.role);
    const headers = getHeaders(data.role);
    await ensureSheet(sheetName, headers);

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const existingRow = await findExistingRow(sheetName, data.name, data.birthday, data.phone);

    if (existingRow > 0) {
        await updateCellsRaw(sheetName, existingRow, [
            { col: 'A', value: now },
            { col: 'B', value: data.center || '' },
            { col: 'C', value: data.subRegion || '' },
            { col: 'D', value: data.name || '' },
            { col: 'E', value: data.birthday || '' },
            { col: 'F', value: data.phone || '' },
            { col: 'G', value: data.email || '' },
            { col: 'H', value: data.address || '' },
        ]);
    } else {
        const rowData = new Array(headers.length).fill('');
        rowData[0] = now;
        rowData[1] = data.center || '';
        rowData[2] = data.subRegion || '';
        rowData[3] = data.name || '';
        rowData[4] = data.birthday || '';
        rowData[5] = data.phone || '';
        rowData[6] = data.email || '';
        rowData[7] = data.address || '';
        rowData[20] = '재직 중';

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [rowData] },
        });
    }
}

// ===== 차량정보만 업데이트 =====
export async function updateVehicleInfo(data: any) {
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not set");
    const sheetName = getSheetName(data.role);
    const headers = getHeaders(data.role);
    await ensureSheet(sheetName, headers);

    const existingRow = await findExistingRow(sheetName, data.name, data.birthday, data.phone);
    if (existingRow <= 0) {
        throw new Error("개인정보가 먼저 등록되어야 합니다.");
    }

    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const updates: { col: string; value: string }[] = [
        { col: 'A', value: now },
    ];

    if (data.vehicleName) updates.push({ col: 'I', value: data.vehicleName });
    if (data.licensePlate) updates.push({ col: 'J', value: data.licensePlate });
    if (data.fuelType) updates.push({ col: 'K', value: data.fuelType });
    if (data.vehicleType) updates.push({ col: 'L', value: data.vehicleType });
    if (data.plateType) updates.push({ col: 'M', value: data.plateType });
    if (data.platePurpose) updates.push({ col: 'N', value: data.platePurpose });
    if (data.co2Emission) updates.push({ col: 'O', value: data.co2Emission });
    if (data.loadingCapacity) updates.push({ col: 'R', value: data.loadingCapacity });

    await updateCells(sheetName, existingRow, updates);
}

// ===== 서류 링크 업데이트 =====
const DOC_TYPE_TO_HEADER: Record<string, string> = {
    '사업자등록증': '서류링크_사업자등록증',
    '사업자등록증명원': '서류링크_사업자등록증',
    '위수탁계약서': '서류링크_위수탁계약서',
    '부속합의서': '서류링크_부속합의서',
    '사무실 임대(전대)차계약서': '서류링크_사무실 임대(전대)차계약서',
    '사무실 전대차 동의서': '서류링크_사무실 전대차 동의서',
    '영업소 등기부등본': '서류링크_영업소 등기부등본',
    '산재보험가입증명원': '서류링크_산재보험가입증명원',
    '자동차등록증': '서류링크_자동차등록증',
    '화물운송종사 자격증': '서류링크_화물운송종사 자격증',
    '화물운송종사자격증': '서류링크_화물운송종사 자격증',
    '운전면허증': '서류링크_운전면허증',
    '자동차운전면허증': '서류링크_운전면허증',
    '안전교육 이수증': '서류링크_안전교육 이수증',
    '화물운송 허가증': '서류링크_화물운송 허가증',
    '택배기사 명부': '서류링크_택배기사 명부',
    '영업소 전경 사진': '서류링크_영업소 전경 사진',
};

const DOC_TYPE_TO_HEADER_DRIVER: Record<string, string> = {
    '위수탁계약서': '서류링크_위수탁계약서 및 부속합의서',
    '부속합의서': '서류링크_위수탁계약서 및 부속합의서',
    '위수탁계약서 및 부속합의서': '서류링크_위수탁계약서 및 부속합의서',
    '사업자등록증': '서류링크_사업자등록증',
    '사업자등록증명원': '서류링크_사업자등록증',
    '산재보험가입증명원': '서류링크_산재보험가입증명원',
    '안전교육 이수증': '서류링크_안전교육 이수증',
    '자동차등록증': '서류링크_자동차등록증',
    '화물운송종사 자격증': '서류링크_화물운송종사 자격증',
    '화물운송종사자격증': '서류링크_화물운송종사 자격증',
    '운전면허증': '서류링크_운전면허증',
    '자동차운전면허증': '서류링크_운전면허증',
    '화물운송 허가증': '서류링크_화물운송 허가증',
};

export async function updateDocumentLinks(data: {
    name: string;
    birthday: string;
    phone: string;
    docType: string;
    fileUrl: string;
    center?: string;
    subRegion?: string;
    role?: string;
}) {
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not set");
    const sheetName = getSheetName(data.role);
    const headers = getHeaders(data.role);
    await ensureSheet(sheetName, headers);

    // [수정] ensureUserRow로 행 자동 생성
    const existingRow = await ensureUserRow(data);
    if (existingRow <= 0) return;

    // 만약 manager이고 docType이 '위수탁계약서 및 부속합의서'이거나 '위수탁계약서, 부속합의서'인 경우:
    // '위수탁계약서'와 '부속합의서' 두 군데 모두 기록하도록 분기 처리
    if (data.role === 'manager' && (data.docType === '위수탁계약서 및 부속합의서' || data.docType === '위수탁계약서, 부속합의서')) {
        await Promise.all([
            updateSingleDocLink(sheetName, existingRow, '위수탁계약서', data.fileUrl, data.role),
            updateSingleDocLink(sheetName, existingRow, '부속합의서', data.fileUrl, data.role)
        ]);
        return;
    }

    await updateSingleDocLink(sheetName, existingRow, data.docType, data.fileUrl, data.role);
}

async function updateSingleDocLink(
    sheetName: string,
    existingRow: number,
    docType: string,
    fileUrl: string,
    role?: string
) {
    const headerMap = role === 'manager' ? DOC_TYPE_TO_HEADER : DOC_TYPE_TO_HEADER_DRIVER;
    const searchHeader = headerMap[docType] || `서류링크_${docType}`;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${sheetName}!A1:BZ1`,
    });
    const headerRow = res.data.values?.[0] || [];

    let colIndex = headerRow.findIndex(h => h.trim() === searchHeader);

    if (colIndex === -1) {
        colIndex = headerRow.findIndex(h => {
            const cleanH = h.replace('서류링크_', '').trim();
            if (!cleanH) return false;
            return cleanH.includes(docType) || docType.includes(cleanH);
        });
    }

    if (colIndex === -1) {
        colIndex = headerRow.length;
        const newColLetter = colLetter(colIndex);
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${sheetName}!${newColLetter}1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[searchHeader]] },
        });
    }

    const col = colLetter(colIndex);
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${sheetName}!${col}${existingRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[fileUrl]] },
    });
    console.log(`[Construction Sheets] 서류 링크 업데이트: ${sheetName} / ${docType} → ${col}${existingRow} (${searchHeader})`);
}

// ===== 전체 데이터 조회 =====
export async function getConstructionTeams(center?: string, subRegion?: string) {
    if (!SPREADSHEET_ID) return [];
    try {
        const roles = ['manager', 'driver'];
        let allTeams: any[] = [];

        for (const role of roles) {
            const sheetName = getSheetName(role);
            const headers = getHeaders(role);
            await ensureSheet(sheetName, headers);
            if (allTeams.some(t => t.sheetName === sheetName)) continue;

            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A:BZ`,
            });
            const rows = res.data.values;
            if (!rows || rows.length <= 1) continue;

            const headerRow = rows[0];
            let teams = rows.slice(1).map((row, index) => {
                const teamData: any = {
                    id: `${role}_${index + 2}`,
                    role, sheetName,
                    submittedAt: row[0] || '', center: row[1] || '', subRegion: row[2] || '',
                    name: row[3] || '', birthday: row[4] || '', phone: row[5] || '',
                    email: row[6] || '', address: row[7] || '',
                    vehicleName: row[8] || '', licensePlate: row[9] || '', fuelType: row[10] || '',
                    vehicleType: row[11] || '', plateType: row[12] || '', platePurpose: row[13] || '',
                    co2Emission: row[14] || '',
                    cargoLicenseNum: row[15] || '', cargoLicenseDate: row[16] || '',
                    loadingCapacity: row[17] || '',
                    driverLicenseType: row[18] || '', driverLicenseNum: row[19] || '',
                    status: row[20] || '재직 중',
                };
                for (let i = 21; i < headerRow.length; i++) {
                    const colName = headerRow[i];
                    if (colName && colName.startsWith('서류링크_')) {
                        const docName = colName.replace('서류링크_', '');
                        teamData[`doc_${docName}`] = row[i] || '';
                    }
                }
                teamData.docBusiness = teamData[`doc_사업자등록증`] || '';
                teamData.docContract = teamData[`doc_위수탁계약서`] || teamData[`doc_위수탁계약서 및 부속합의서`] || '';
                teamData.docVehicle = teamData[`doc_자동차등록증`] || '';
                teamData.docDriver = teamData[`doc_운전면허증`] || '';
                teamData.docCargo = teamData[`doc_화물운송종사 자격증`] || teamData[`doc_화물운송종사자격증`] || '';
                teamData.docOther = teamData[`doc_기타`] || teamData[`doc_안전교육 이수증`] || '';
                return teamData;
            });
            allTeams = allTeams.concat(teams);
        }

        if (subRegion) allTeams = allTeams.filter(t => t.subRegion === subRegion);
        else if (center) allTeams = allTeams.filter(t => t.center === center);
        return allTeams;
    } catch (error) {
        console.error("Error fetching teams:", error);
        return [];
    }
}

// ===== 상태 변경 =====
export async function updateConstructionTeamStatus(rowIndex: number, status: string, role?: string) {
    if (!SPREADSHEET_ID) return;
    const sheetName = getSheetName(role);
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!U${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[status]] },
    });
}

// ===== 권역장 정보 직접 수정 =====
export async function updateConstructionTeam(rowIndex: number, role: string, fields: any) {
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not set");
    const sheetName = getSheetName(role);
    const headers = getHeaders(role);
    await ensureSheet(sheetName, headers);

    const updates: { col: string; value: string }[] = [];
    const addField = (col: string, val: any) => {
        if (val !== undefined) {
            updates.push({ col, value: String(val) });
        }
    };

    addField('D', fields.name);
    addField('E', fields.birthday);
    addField('F', fields.phone);
    addField('G', fields.email);
    addField('H', fields.address);
    addField('I', fields.vehicleName);
    addField('J', fields.licensePlate);
    addField('K', fields.fuelType);
    addField('L', fields.vehicleType);
    addField('M', fields.plateType);
    addField('N', fields.platePurpose);
    addField('O', fields.co2Emission);
    addField('P', fields.cargoLicenseNum);
    addField('Q', fields.cargoLicenseDate);
    addField('R', fields.loadingCapacity);
    addField('S', fields.driverLicenseType);
    addField('T', fields.driverLicenseNum);
    addField('U', fields.status);

    if (updates.length > 0) {
        await updateCells(sheetName, rowIndex, updates);
        console.log(`[Construction Sheets] 행 수정 완료: ${sheetName} ${rowIndex}행`);
    }
}


// ===== [수정] OCR 데이터 — 행이 없으면 자동 생성 후 업데이트 =====
export async function updateOCRData(data: {
    name: string;
    birthday: string;
    phone: string;
    docType: string;
    extractedData: Record<string, string>;
    role?: string;
    center?: string;
    subRegion?: string;
}) {
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is not set");
    const sheetName = getSheetName(data.role);
    const headers = getHeaders(data.role);
    await ensureSheet(sheetName, headers);

    // [수정] 행이 없으면 자동 생성
    const existingRow = await ensureUserRow(data);
    if (existingRow <= 0) {
        console.error('[Construction Sheets] OCR 데이터 업데이트 불가: 행 생성 실패', data.name);
        return;
    }

    const { extractedData, docType } = data;
    const updates: { col: string; value: string }[] = [];

    const addIfValid = (col: string, ...candidates: (string | undefined)[]) => {
        for (const val of candidates) {
            if (val && val !== '확인불가') {
                updates.push({ col, value: val });
                return;
            }
        }
    };

    if (docType === '운전면허증' || docType === '자동차운전면허증') {
        addIfValid('H', extractedData['거주지주소']);
        addIfValid('S', extractedData['운전면허종류']);
        addIfValid('T', extractedData['운전면허번호']);
    } else if (docType === '자동차등록증') {
        addIfValid('I', extractedData['차량명'], extractedData['차명']);
        addIfValid('J', extractedData['차량번호'], extractedData['자동차등록번호']);
        addIfValid('K', extractedData['연료종류'], extractedData['연료의종류'], extractedData['연료']);
        addIfValid('L', extractedData['차량종류'], extractedData['차량형태'], extractedData['차종']);
        addIfValid('N', extractedData['번호판종류'], extractedData['용도'], extractedData['번호판종류(용도)']);
        addIfValid('O', extractedData['이산화탄소배출량'], extractedData['CO2배출량']);
        addIfValid('R', extractedData['적재함형태_적재량'], extractedData['최대적재량'], extractedData['적재함형태/적재량']);
    } else if (docType === '화물운송종사 자격증' || docType === '화물운송종사자격증') {
        addIfValid('P', extractedData['화물운송종사자격증번호'], extractedData['자격증번호'], extractedData['종사자격번호']);
        addIfValid('Q', extractedData['종사자격증취득일'], extractedData['취득일자'], extractedData['자격취득일']);
    } else if (docType === '위수탁계약서') {
        addIfValid('G', extractedData['이메일']);
    }

    if (updates.length > 0) {
        await updateCells(sheetName, existingRow, updates);
        console.log(`[Construction Sheets] OCR 데이터 업데이트 완료: ${data.name} / ${data.docType} → ${updates.map(u => u.col).join(',')}`);
    }
}

// ===== 행 삭제 =====
export async function deleteConstructionTeamRow(rowIndex: number, role?: string) {
    if (!SPREADSHEET_ID) return;
    const sheetName = getSheetName(role);
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties',
    });
    const targetSheet = spreadsheet.data.sheets?.find(
        s => s.properties?.title === sheetName
    );
    if (targetSheet?.properties?.sheetId === undefined) return;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: targetSheet.properties.sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex,
                    }
                }
            }]
        }
    });
}

// ===== 권역장 비밀번호 관리 =====
const PASSWORD_HEADERS = ['센터명', '영업소명', '비밀번호'];

const ALL_OFFICES = [
    { center: '양지센터(B2C)', sub: '양지6영업소((주)디에스엔지니어)' },
    { center: '양지센터(B2C)', sub: '양지7영업소((주)서현테크)' },
    { center: '양지센터(B2C)', sub: '양지8영업소(스타일룸)' },
    { center: '양지센터(B2C)', sub: '양지12영업소(TY서비스)' },
    { center: '양지센터(B2C)', sub: '양지2_2영업소(엠케이프로젝트퍼니처)' },
    { center: '양지센터(B2C)', sub: '양지23영업소(일룸)' },
    { center: '양지센터(B2C)', sub: '양지13영업소' },
    { center: '양지센터(B2C)', sub: '양지9영업소(그랑팩토리)' },
    { center: '양지센터(B2C)', sub: '안성1영업소(유빈산업)' },
    { center: '양지센터(B2C)', sub: '양지22영업소(에이와이가구)' },
    { center: '양지센터(B2C)', sub: '양지2_1영업소(요다프렌즈)' },
    { center: '양지센터(B2B)', sub: '양지14영업소(LHS)' },
    { center: '양지센터(B2B)', sub: '양지15영업소(CMS 프로모션)' },
    { center: '양지센터(B2B)', sub: '양지16영업소(오성)' },
    { center: '양지센터(B2B)', sub: '양지17영업소(온찬유통)' },
    { center: '양지센터(B2B)', sub: '양지18영업소(모든퍼니처)' },
    { center: '양지센터(B2B)', sub: '양지19영업소(드래곤)' },
    { center: '양지센터(B2B)', sub: '양지20영업소(정인유통)' },
    { center: '지방센터', sub: '부산1영업소(태인유통)' },
    { center: '지방센터', sub: '부산(기장)2영업소(태준유통)' },
    { center: '지방센터', sub: '전남1영업소(스마일유통)' },
    { center: '지방센터', sub: '창원1영업소(정빈유통)' },
    { center: '지방센터', sub: '울산1영업소(수연유통)' },
    { center: '지방센터', sub: '제주1영업소(스마일유통)' },
    { center: '대구센터', sub: '대구1영업소(투윈스)' },
    { center: '대구센터', sub: '대구2영업소(대구가구)' },
    { center: '대구센터', sub: '대구3영업소(형제유통)' },
    { center: '대구센터', sub: '대구4영업소(석퍼시스)' },
    { center: '대전센터', sub: '대전1영업소(주식회사오제이더블유)' },
    { center: '대전센터', sub: '대전2영업소(주식회사에스엔티)' },
    { center: '대전센터', sub: '대전3영업소(주식회사티오피플랜)' },
    { center: '대전센터', sub: '대전4영업소(무빙인)' },
    { center: '대전센터', sub: '대전5영업소(비비디)' },
    { center: '광주센터', sub: '광주1영업소(주식회사와이에스유통)' },
    { center: '광주센터', sub: '광주2영업소(FIT퍼니처)' },
    { center: '광주센터', sub: '전북1영업소(대영)' },
];

async function ensurePasswordSheet(): Promise<void> {
    try {
        await ensureSheet(PASSWORD_SHEET, PASSWORD_HEADERS);
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID!,
            range: `${PASSWORD_SHEET}!A:Z`,
        });
        const rows = res.data.values;
        const header = rows?.[0] || [];
        const isCorrectFormat = header.length >= 3
            && header[0]?.toString().trim() === '센터명'
            && header[1]?.toString().trim() === '영업소명'
            && header[2]?.toString().trim() === '비밀번호';
        if (isCorrectFormat && rows && rows.length > 1) return;

        console.log('[Construction Sheets] 비밀번호 시트 포맷 불일치 — 전체 초기화 시작');
        const clearRange = rows && rows.length > 0
            ? `${PASSWORD_SHEET}!A1:Z${rows.length + 10}`
            : `${PASSWORD_SHEET}!A1:Z100`;
        await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID!, range: clearRange });
        const allData = [PASSWORD_HEADERS, ...ALL_OFFICES.map(o => [o.center, o.sub, '1234'])];
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID!, range: `${PASSWORD_SHEET}!A1`,
            valueInputOption: 'RAW', requestBody: { values: allData },
        });
        console.log('[Construction Sheets] 비밀번호 시트 초기화 완료 ✓');
    } catch (error) {
        console.error('[Construction Sheets] 비밀번호 시트 초기화 실패:', error);
    }
}

export async function verifyRegionPassword(subRegion: string, password: string): Promise<boolean> {
    if (!SPREADSHEET_ID) return false;
    try {
        await ensurePasswordSheet();
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${PASSWORD_SHEET}!A:C` });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return false;
        for (let i = 1; i < rows.length; i++) {
            if ((rows[i][1] || '').toString().trim() === subRegion.trim() && (rows[i][2] || '').toString().trim() === password.trim()) return true;
        }
        return false;
    } catch (e) {
        console.error("[verifyRegionPassword] 에러 발생:", e);
        return false;
    }
}

export async function getRegionPasswords(): Promise<{ center: string; subRegion: string; password: string }[]> {
    if (!SPREADSHEET_ID) return [];
    try {
        await ensurePasswordSheet();
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${PASSWORD_SHEET}!A:C` });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return [];
        return rows.slice(1).map(row => ({ center: row[0] || '', subRegion: row[1] || '', password: (row[2] || '').toString() }));
    } catch (e) {
        console.error("[getRegionPasswords] 에러 발생:", e);
        return [];
    }
}

export async function updateRegionPassword(subRegion: string, newPassword: string): Promise<boolean> {
    if (!SPREADSHEET_ID) return false;
    try {
        await ensurePasswordSheet();
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${PASSWORD_SHEET}!A:C` });
        const rows = res.data.values;
        if (!rows || rows.length <= 1) return false;
        for (let i = 1; i < rows.length; i++) {
            if ((rows[i][1] || '').toString().trim() === subRegion.trim()) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID, range: `${PASSWORD_SHEET}!C${i + 1}`,
                    valueInputOption: 'RAW', requestBody: { values: [[newPassword]] },
                });
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("[updateRegionPassword] 에러 발생:", e);
        return false;
    }
}