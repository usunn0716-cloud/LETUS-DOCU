import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { itemId, userName, userPhone, subRegion, birthday } = await req.json();

        if (!itemId || !userName || !userPhone || !subRegion) {
            return NextResponse.json(
                { error: "itemId, userName, userPhone, subRegion are required" },
                { status: 400 }
            );
        }

        const { getSheetNameByItemId, deleteSheetRow } = await import("@/lib/google-sheets");

        const sheetName = getSheetNameByItemId(itemId);
        if (!sheetName) {
            // 이 itemId에 해당하는 시트가 없으면 (스프레드시트에 기록하지 않는 서류)
            return NextResponse.json({ skipped: true, message: "해당 서류는 스프레드시트 기록 대상이 아닙니다." });
        }

        let finalBirthday = birthday;
        let finalSubRegion = subRegion;

        if (!finalBirthday || !finalSubRegion) {
            const { collection, getDocs, query, where } = await import("firebase/firestore");
            const { db } = await import("@/lib/firebase");
            const userQ = query(collection(db, "users"), where("name", "==", userName), where("phone", "==", userPhone));
            const userSnap = await getDocs(userQ);
            if (!userSnap.empty) {
                const userData = userSnap.docs[0].data();
                if (!finalBirthday) finalBirthday = userData.birthday || "";
                if (!finalSubRegion) finalSubRegion = userData.subRegion || "";
            }
        }

        if (!finalSubRegion) {
             return NextResponse.json(
                { error: "subRegion is required" },
                { status: 400 }
            );
        }

        await deleteSheetRow(sheetName, userName, userPhone, finalSubRegion, finalBirthday);

        return NextResponse.json({ success: true, sheetName });
    } catch (error: any) {
        console.error("[Delete Sheet Row] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
