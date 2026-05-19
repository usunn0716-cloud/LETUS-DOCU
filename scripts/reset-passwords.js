// 비밀번호 시트 강제 초기화 스크립트
const { google } = require('googleapis');
const fs = require('fs');

// .env.local 직접 파싱
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match) {
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        env[match[1].trim()] = val;
    }
});

const SPREADSHEET_ID = env.GOOGLE_SHEETS_CONSTRUCTION_ID;
const CLIENT_EMAIL = env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

const PASSWORD_SHEET = '권역장비밀번호';

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

async function main() {
    console.log('=== 비밀번호 시트 강제 초기화 시작 ===');
    console.log('SPREADSHEET_ID:', SPREADSHEET_ID);
    console.log('CLIENT_EMAIL:', CLIENT_EMAIL);

    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 1단계: 현재 시트 상태 확인
    console.log('\n[1] 현재 시트 상태 확인...');
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PASSWORD_SHEET}!A:Z`,
        });
        const rows = res.data.values;
        console.log(`   현재 행 수: ${rows?.length || 0}`);
        if (rows && rows.length > 0) {
            console.log(`   헤더: ${JSON.stringify(rows[0])}`);
            if (rows.length > 1) {
                console.log(`   첫 데이터행: ${JSON.stringify(rows[1])}`);
                console.log(`   마지막행: ${JSON.stringify(rows[rows.length - 1])}`);
            }
        }
    } catch (e) {
        console.log('   시트가 없거나 접근 불가:', e.message);
    }

    // 2단계: 시트 탭 자체를 삭제
    console.log('\n[2] 기존 시트 탭 삭제 시도...');
    try {
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
            fields: 'sheets.properties',
        });
        const targetSheet = spreadsheet.data.sheets?.find(
            s => s.properties?.title === PASSWORD_SHEET
        );
        if (targetSheet?.properties?.sheetId !== undefined) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [{
                        deleteSheet: { sheetId: targetSheet.properties.sheetId }
                    }]
                }
            });
            console.log('   ✓ 기존 탭 삭제 완료');
        } else {
            console.log('   탭 없음 (정상)');
        }
    } catch (e) {
        console.log('   삭제 실패 (무시):', e.message);
    }

    // 3단계: 새 시트 탭 생성
    console.log('\n[3] 새 시트 탭 생성...');
    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{
                    addSheet: { properties: { title: PASSWORD_SHEET } }
                }]
            }
        });
        console.log('   ✓ 새 탭 생성 완료');
    } catch (e) {
        console.log('   생성 실패:', e.message);
    }

    // 4단계: 헤더 + 데이터 작성 (RAW 모드)
    console.log('\n[4] 헤더 + 데이터 작성 (RAW 모드)...');
    const allData = [
        ['센터명', '영업소명', '비밀번호'],
        ...ALL_OFFICES.map(o => [o.center, o.sub, '1234']),
    ];
    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PASSWORD_SHEET}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: allData },
        });
        console.log(`   ✓ ${ALL_OFFICES.length}개 영업소 비밀번호 작성 완료 (기본: 1234)`);
    } catch (e) {
        console.log('   작성 실패:', e.message);
    }

    // 5단계: 검증
    console.log('\n[5] 검증...');
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PASSWORD_SHEET}!A:C`,
        });
        const rows = res.data.values;
        console.log(`   총 행 수: ${rows?.length || 0}`);
        console.log(`   헤더: ${JSON.stringify(rows?.[0])}`);
        console.log(`   첫 데이터: ${JSON.stringify(rows?.[1])}`);
        console.log(`   마지막 데이터: ${JSON.stringify(rows?.[rows.length - 1])}`);

        // 비밀번호 값 체크
        const pwValues = rows?.slice(1).map(r => r[2]);
        const allCorrect = pwValues?.every(p => p === '1234');
        console.log(`\n   === 모든 비밀번호가 '1234'인가? ${allCorrect ? '✓ YES' : '✗ NO'} ===`);
        if (!allCorrect) {
            const wrong = pwValues?.filter(p => p !== '1234');
            console.log(`   잘못된 값들: ${JSON.stringify([...new Set(wrong)])}`);
        }
    } catch (e) {
        console.log('   검증 실패:', e.message);
    }

    console.log('\n=== 초기화 완료 ===');
}

main().catch(console.error);
