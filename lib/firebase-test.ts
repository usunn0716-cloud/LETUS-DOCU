// Firebase 연결 테스트 유틸리티
import { db } from "./firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from "firebase/firestore";

/**
 * Firebase Firestore 연결 테스트
 * 테스트 문서를 생성하고 읽고 삭제하여 연결 상태를 확인합니다.
 */
export async function testFirebaseConnection(): Promise<{
    success: boolean;
    message: string;
    details?: string;
}> {
    try {
        // 1. 테스트 문서 생성
        const testRef = await addDoc(collection(db, "_connection_test"), {
            test: true,
            timestamp: serverTimestamp(),
            message: "LETUS Platform 연결 테스트",
        });

        // 2. 테스트 문서 읽기
        const snapshot = await getDocs(collection(db, "_connection_test"));
        const found = snapshot.docs.some(d => d.id === testRef.id);

        if (!found) {
            return {
                success: false,
                message: "Firestore 읽기 실패: 생성한 문서를 찾을 수 없습니다.",
            };
        }

        // 3. 테스트 문서 삭제
        await deleteDoc(doc(db, "_connection_test", testRef.id));

        return {
            success: true,
            message: "✅ Firebase 연결 성공! Firestore 읽기/쓰기가 정상 작동합니다.",
        };
    } catch (error: any) {
        let details = error.message || "알 수 없는 오류";

        if (details.includes("permission-denied")) {
            details = "Firestore 보안규칙에서 읽기/쓰기가 거부되었습니다. Firebase Console에서 보안규칙을 확인하세요.";
        } else if (details.includes("not-found") || details.includes("FIREBASE_CONFIG")) {
            details = ".env.local 파일의 Firebase 설정값을 확인하세요.";
        } else if (details.includes("network")) {
            details = "네트워크 연결을 확인하세요.";
        }

        return {
            success: false,
            message: "❌ Firebase 연결 실패",
            details,
        };
    }
}
