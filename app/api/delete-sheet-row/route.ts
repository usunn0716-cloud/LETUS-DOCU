import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { itemId, userName, userPhone } = await req.json();

        if (!itemId || !userName || !userPhone) {
            return NextResponse.json(
                { error: "itemId, userName, userPhone are required" },
                { status: 400 }
            );
        }

        const { getSheetNameByItemId, deleteSheetRow } = await import("@/lib/google-sheets");

        const sheetName = getSheetNameByItemId(itemId);
        if (!sheetName) {
            // 이 itemId에 해당하는 시트가 없으면 (스프레드시트에 기록하지 않는 서류)
            return NextResponse.json({ skipped: true, message: "해당 서류는 스프레드시트 기록 대상이 아닙니다." });
        }

        await deleteSheetRow(sheetName, userName, userPhone);

        return NextResponse.json({ success: true, sheetName });
    } catch (error: any) {
        console.error("[Delete Sheet Row] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
