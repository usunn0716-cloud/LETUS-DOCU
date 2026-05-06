// Firestore 초기 데이터 시드 유틸리티
// 기존 REGIONAL_DATA를 Firestore에 업로드합니다
import { db } from "./firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { REGIONAL_DATA } from "../app/data/mock";

/**
 * REGIONAL_DATA 초기 데이터를 Firestore regional_data 컬렉션에 시드
 * 이미 데이터가 있으면 스킵
 */
export async function seedRegionalData(): Promise<{
    success: boolean;
    message: string;
    count: number;
}> {
    try {
        // 이미 데이터가 있는지 확인
        const snapshot = await getDocs(collection(db, "regional_data"));
        if (!snapshot.empty) {
            return {
                success: true,
                message: `이미 ${snapshot.size}개의 영업소 데이터가 존재합니다. 스킵합니다.`,
                count: snapshot.size,
            };
        }

        // 데이터 시드
        let count = 0;
        for (const item of REGIONAL_DATA) {
            await addDoc(collection(db, "regional_data"), {
                region: item.region,
                subRegion: item.subRegion,
                managerName: item.managerName,
                stats: item.stats,
                createdAt: serverTimestamp(),
            });
            count++;
        }

        return {
            success: true,
            message: `✅ ${count}개 영업소 데이터를 Firestore에 시드했습니다.`,
            count,
        };
    } catch (error: any) {
        return {
            success: false,
            message: `❌ 시드 실패: ${error.message}`,
            count: 0,
        };
    }
}
