const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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

// Since we have Firebase Config in env, let's initialize firebase
// Wait, we need the Service Account for admin SDK!
// Is there a firebase-admin service account key?
// Wait, we loaded the google sheets key earlier. Let's see if there is a firebase service account key!
// Let's check config/ directory or check if we can use the environment variables.
// Actually, firebase admin SDK can also use the service account if it's there.
// Wait! Let's check the contents of .env.local to see if there is FIREBASE_SERVICE_ACCOUNT or similar!
// Let's print the keys in .env.local!
console.log('Env keys:', Object.keys(processEnv));

// Wait! We don't have to initialize Admin SDK if we can't find a service account key.
// But wait, the Google Sheets key might be the same? Or let's see if we have config/service-account.json.
// Wait, let's look at config/ directory or other JSON files in the workspace!
