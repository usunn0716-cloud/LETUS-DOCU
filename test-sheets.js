const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Simple parser for .env.local
const envPath = './.env.local';
if (!fs.existsSync(envPath)) {
    console.error('.env.local file not found!');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const processEnv = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.substring(0, firstEq).trim();
    let val = trimmed.substring(firstEq + 1).trim();
    // Strip quotes if present
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    processEnv[key] = val;
});

const SPREADSHEET_ID = processEnv.GOOGLE_SHEETS_CONSTRUCTION_ID;
const CLIENT_EMAIL = processEnv.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = processEnv.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('Credentials not found in .env.local!');
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: CLIENT_EMAIL,
        private_key: PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function main() {
    try {
        // Read manager rows
        const managerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: '권역장등록현황!A1:AA2',
        });
        console.log('\n--- 권역장등록현황 columns & Row 2 ---');
        const mRows = managerRes.data.values || [];
        if (mRows.length > 0) {
            const headers = mRows[0];
            const row2 = mRows[1] || [];
            headers.forEach((h, idx) => {
                console.log(`${idx + 1} (${colLetter(idx)}): ${h} = "${row2[idx] || ''}"`);
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

function colLetter(idx) {
    let letter = '';
    while (idx >= 0) {
        letter = String.fromCharCode((idx % 26) + 65) + letter;
        idx = Math.floor(idx / 26) - 1;
    }
    return letter;
}

main();
