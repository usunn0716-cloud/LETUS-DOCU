import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteDocumentFile } from "@/lib/storage";

// 임시 API: 특정 사용자의 모든 서류 초기화 (파일 포함)
// 사용법: GET /api/admin-reset-user?name=김태영
export async function GET(req: NextRequest) {
    const name = req.nextUrl.searchParams.get("name");
    if (!name) {
        return NextResponse.json({ error: "name 파라미터가 필요합니다." }, { status: 400 });
    }

    try {
        // 해당 이름의 모든 서류 조회
        const q = query(collection(db, "documents"), where("userName", "==", name));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return NextResponse.json({ message: `'${name}' 사용자의 서류를 찾을 수 없습니다.` });
        }

        // 사용자 정보 조회 (Google Sheets 삭제를 위한 고유키 파라미터 획득)
        const userQ = query(collection(db, "users"), where("name", "==", name));
        const userSnap = await getDocs(userQ);
        let userPhone = "";
        let subRegion = "";
        let birthday = "";
        if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            userPhone = userData.phone || "";
            subRegion = userData.subRegion || "";
            birthday = userData.birthday || "";
        }

        const { getSheetNameByItemId, deleteSheetRow } = await import("@/lib/google-sheets");
        const results: { id: string; title: string; deleted: string[] }[] = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const deletedUrls: string[] = [];

            // Storage 파일 삭제
            const urls = [
                data.fileUrl,
                data.fileUrl2,
                ...((data.fileUrls as string[]) || [])
            ].filter(Boolean) as string[];

            await Promise.allSettled(
                urls.map(async (url) => {
                    await deleteDocumentFile(url);
                    deletedUrls.push(url);
                })
            );

            // Firestore 초기화
            await updateDoc(doc(db, "documents", docSnap.id), {
                status: "pending",
                fileUrl: null,
                fileName: null,
                fileUrl2: null,
                fileName2: null,
                fileUrls: null,
                fileNames: null,
                verificationResult: null,
                verificationResult2: null,
                rejectionReason: null,
            });

            results.push({ id: docSnap.id, title: data.title, deleted: deletedUrls });

            // Google Sheets 해당 행 삭제
            if (data.itemId) {
                const sheetName = getSheetNameByItemId(data.itemId);
                if (sheetName) {
                    await deleteSheetRow(sheetName, name, userPhone, subRegion, birthday);
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `'${name}' 사용자의 서류 ${results.length}건 초기화 완료`,
            details: results,
        });
    } catch (error: any) {
        console.error("초기화 실패:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
