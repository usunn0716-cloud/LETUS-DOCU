import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FirestoreDocument } from "./firestore";

/**
 * 서류 목록을 ZIP 파일로 다운로드
 * @param docs - 다운로드할 서류 목록 (fileUrl이 있는 것만)
 * @param zipFileName - ZIP 파일명 (예: "김태영_전체서류")
 * @param onProgress - 진행률 콜백 (0~100)
 */
export async function downloadDocumentsAsZip(
    docs: FirestoreDocument[],
    zipFileName: string,
    onProgress?: (percent: number) => void
): Promise<void> {
    const zip = new JSZip();

    // fileUrl이 있는 서류만 필터
    const docsWithFiles: { url: string; name: string }[] = [];
    for (const doc of docs) {
        if (doc.fileUrl) {
            const ext = getExtension(doc.fileUrl);
            docsWithFiles.push({
                url: doc.fileUrl,
                name: `${doc.userName}_${doc.title}${ext}`,
            });
        }
        // 두 번째 파일 (부속합의서 등)
        if ((doc as any).fileUrl2) {
            const ext = getExtension((doc as any).fileUrl2);
            docsWithFiles.push({
                url: (doc as any).fileUrl2,
                name: `${doc.userName}_${doc.title}_부속합의서${ext}`,
            });
        }
        // 갤러리 파일 (영업소 전경 사진 등)
        const galleryUrls: string[] = (doc as any).fileUrls || [];
        galleryUrls.forEach((url, i) => {
            const ext = getExtension(url);
            docsWithFiles.push({
                url,
                name: `${doc.userName}_${doc.title}_${i + 1}${ext}`,
            });
        });
    }

    if (docsWithFiles.length === 0) {
        alert("다운로드할 서류가 없습니다.");
        return;
    }

    // 중복 파일명 방지
    const nameCount: Record<string, number> = {};
    const uniqueFiles = docsWithFiles.map(f => {
        if (nameCount[f.name]) {
            nameCount[f.name]++;
            const parts = f.name.split(".");
            const ext = parts.pop();
            f.name = `${parts.join(".")}_${nameCount[f.name]}.${ext}`;
        } else {
            nameCount[f.name] = 1;
        }
        return f;
    });

    // 파일 다운로드 + ZIP에 추가
    let completed = 0;
    const total = uniqueFiles.length;

    for (const file of uniqueFiles) {
        try {
            // CORS 우회용 프록시 API 호출
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(file.url)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            zip.file(file.name, blob);
        } catch (err) {
            console.warn(`파일 다운로드 실패: ${file.name}`, err);
            // 실패한 파일은 건너뛰고 계속 진행
        }
        completed++;
        onProgress?.(Math.round((completed / total) * 100));
    }

    // ZIP 생성 및 다운로드
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${zipFileName}.zip`);
}

/**
 * URL에서 파일 확장자 추출
 */
function getExtension(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.[a-zA-Z0-9]+(?=\?|$)/);
        if (match) return match[0];
        // Firebase Storage URL에서 확장자 추출
        const encodedMatch = pathname.match(/%2F[^%]*(\.[a-zA-Z0-9]+)/);
        if (encodedMatch) return encodedMatch[1];
    } catch {
        // fallback
    }
    return ".jpg"; // 기본값
}
