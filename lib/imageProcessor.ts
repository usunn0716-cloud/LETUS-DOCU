
/**
 * 모바일 카메라 이미지(HEIC, 대용량, EXIF 회전)를 OCR에 적합하게 전처리합니다.
 * 1. HEIC/HEIF 포맷을 JPEG로 변환
 * 2. EXIF 방향각(Orientation)을 읽어 정방향 회전
 * 3. 최대 해상도 1600px, 용량 1.5MB 이하로 압축 (AI 판독 최적화 및 속도 향상)
 * 4. 포맷은 항상 image/jpeg로 통일
 * 
 * @param file 원본 File 객체
 * @returns 전처리(압축 및 회전 보정)된 File 객체
 */
export async function processUploadImage(file: File): Promise<File> {
    let targetFile = file;

    // 1. HEIC 포맷 변환 (아이폰 등)
    if (file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) {
        try {
            const { default: heic2any } = await import("heic2any");
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.9,
            });
            // heic2any는 Blob 또는 Blob 배열을 반환함
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            targetFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
                type: "image/jpeg",
            });
        } catch (error) {
            console.warn("HEIC 변환 실패. 원본 파일로 압축을 시도합니다.", error);
        }
    }

    // 2. EXIF 회전 보정 및 해상도/용량 압충
    try {
        const options = {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
            fileType: "image/jpeg",
        };

        const { default: imageCompression } = await import("browser-image-compression");
        const compressedBlob = await imageCompression(targetFile, options as any);

        // 확장자를 무조건 .jpg로 변경하여 리턴 (MIME 타입 불일치 및 OCR API 오류 방지)
        const finalName = targetFile.name.replace(/\.[^/.]+$/, "") + ".jpg";

        return new File([compressedBlob], finalName, {
            type: "image/jpeg",
        });
    } catch (error) {
        console.error("이미지 압축 및 회전 보정 실패:", error);
        // 압축 실패 시, HEIC 변환만 된 파일이라도 반환 (최소한의 호환성 확보)
        return targetFile;
    }
}
