const admin = require('firebase-admin');

// Initialize Firebase Admin using default credentials or project ID
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'letus-docu' // replace with your project ID if different
    });
}

const db = admin.firestore();

async function inspect() {
    console.log("=== FIRESTORE DOCUMENTS INSPECTION ===");
    const snapshot = await db.collection("documents").get();
    console.log(`Total documents: ${snapshot.size}`);

    const docs = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        docs.push({
            id: doc.id,
            userName: data.userName,
            userRole: data.userRole,
            userSubRegion: data.userSubRegion,
            status: data.status,
            title: data.title,
            fileUrl: data.fileUrl ? (data.fileUrl.substring(0, 50) + "...") : null,
            reviewedAt: data.reviewedAt || null,
            cancelledAt: data.cancelledAt || null
        });
    });

    console.log(JSON.stringify(docs, null, 2));
}

inspect().catch(console.error);
