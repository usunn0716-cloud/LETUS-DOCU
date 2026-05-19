import { NextResponse } from "next/server";
import { clearAllSheetData } from "@/lib/google-sheets";

export async function POST(req: Request) {
    try {
        await clearAllSheetData();
        return NextResponse.json({ success: true, message: "모든 시트 데이터 초기화 완료" });
    } catch (error: any) {
        console.error("[Admin Reset Sheets] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
