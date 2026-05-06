// Firebase Storage 유틸리티 — 파일 업로드/삭제
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * 서류 파일 업로드 (PNG/PDF)
 * 경로: {영업소명}/{사용자이름}/{서류명}.{확장자}
 * 예시: 양지6영업소((주)디에스엔지니어)/정유선/사업자등록증.pdf
 *
 * 같은 사람이 같은 서류를 재업로드하면 동일 경로에 덮어쓰기됩니다.
 * @returns 다운로드 URL + 원본 파일명
 */
export async function uploadDocumentFile(
    file: File,
    subRegion: string,
    userName: string,
    docTitle: string
): Promise<{ fileUrl: string; fileName: string }> {
    // 파일 확장자 추출
    const ext = file.name.includes(".")
        ? file.name.substring(file.name.lastIndexOf("."))
        : "";

    // 최종 경로: 영업소/이름/서류명.확장자  (한글, 괄호, 숫자 등 그대로 유지)
    const filePath = `${subRegion}/${userName}/${docTitle}${ext}`;
    console.log("[Storage] 업로드 경로:", filePath);

    try {
        const storageRef = ref(storage, filePath);
        const snapshot = await uploadBytes(storageRef, file);
        const fileUrl = await getDownloadURL(snapshot.ref);
        console.log("[Storage] 업로드 성공:", fileUrl);
        return { fileUrl, fileName: file.name };
    } catch (error) {
        console.error("[Storage] 업로드 실패:", error);
        throw error;
    }
}

/**
 * 서류 파일 삭제 (업로드 취소 시)
 * Firebase Storage https 다운로드 URL → 스토리지 경로로 변환 후 삭제
 */
export async function deleteDocumentFile(fileUrl: string): Promise<void> {
    if (!fileUrl) return;
    try {
        let storageRef;
        if (fileUrl.startsWith("https://firebasestorage.googleapis.com")) {
            // https 다운로드 URL에서 /o/ 이후 경로 추출
            const url = new URL(fileUrl);
            const encodedPath = url.pathname.split("/o/")[1];
            if (!encodedPath) throw new Error("Invalid Storage URL");
            const storagePath = decodeURIComponent(encodedPath.split("?")[0]);
            storageRef = ref(storage, storagePath);
        } else {
            // gs:// URL 또는 경로 직접 사용
            storageRef = ref(storage, fileUrl);
        }
        await deleteObject(storageRef);
        console.log("[Storage] 파일 삭제 성공:", fileUrl);
    } catch (error) {
        // 파일이 이미 삭제되었거나 존재하지 않는 경우 무시
        console.warn("파일 삭제 실패 (이미 삭제되었을 수 있음):", error);
    }
}
