// Firestore CRUD 유틸리티 — 사용자, 서류, 통계 관리
import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
    setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

// ============================================
// 사용자 (Users)
// ============================================

export interface FirestoreUser {
    id?: string;
    name: string;
    phone: string;
    birthday?: string;  // 생년월일 6자리 (예: 901215)
    role: "manager" | "courier" | "driver";
    region: string;
    subRegion: string;
    createdAt?: Timestamp;
}

/**
 * 이름 + 전화번호 + 생년월일로 기존 사용자 조회
 * 세 가지가 모두 일치해야 같은 사용자로 인식
 */
export async function findUserByNamePhoneBirthday(name: string, phone: string, birthday: string): Promise<FirestoreUser | null> {
    const q = query(
        collection(db, "users"),
        where("name", "==", name),
        where("phone", "==", phone),
        where("birthday", "==", birthday)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as FirestoreUser;
}

/**
 * 새 사용자 생성
 */
export async function createUser(user: Omit<FirestoreUser, "id" | "createdAt">): Promise<string> {
    const docRef = await addDoc(collection(db, "users"), {
        ...user,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

/**
 * 사용자 조회 또는 생성 (로그인 시 호출)
 * → 동일 이름+전화번호+생년월일이면 기존 유저 반환, 없으면 새로 등록
 */
export async function findOrCreateUser(
    data: Omit<FirestoreUser, "id" | "createdAt">
): Promise<FirestoreUser> {
    const existing = await findUserByNamePhoneBirthday(data.name, data.phone, data.birthday || "");
    if (existing) {
        // 역할/소속 변경 시 업데이트
        if (existing.region !== data.region || existing.subRegion !== data.subRegion || existing.role !== data.role) {
            await updateDoc(doc(db, "users", existing.id!), {
                role: data.role,
                region: data.region,
                subRegion: data.subRegion,
            });
        }
        return existing;
    }
    const id = await createUser(data);
    return { id, ...data };
}

/**
 * 사용자 정보 업데이트
 */
export async function updateUser(userId: string, data: Partial<FirestoreUser>): Promise<void> {
    // 1. 사용자 문서 업데이트
    await updateDoc(doc(db, "users", userId), data);

    // 2. 만약 이름이나 전화번호가 변경되었다면, 해당 사용자의 모든 서류 정보도 업데이트
    if (data.name || data.phone) {
        const q = query(collection(db, "documents"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        const updatePromises = snapshot.docs.map(d =>
            updateDoc(doc(db, "documents", d.id), {
                ...(data.name ? { userName: data.name } : {}),
                ...(data.phone ? { userPhone: data.phone } : {}),
            })
        );
        await Promise.all(updatePromises);
    }
}

/**
 * 사용자 삭제 (사용자 문서와 해당 사용자의 모든 서류 삭제)
 */
export async function deleteUser(userId: string): Promise<void> {
    // 1. 사용자의 모든 서류 삭제
    const q = query(collection(db, "documents"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "documents", d.id)));
    await Promise.all(deletePromises);

    // 2. 사용자 계정 삭제
    await deleteDoc(doc(db, "users", userId));
}

// ============================================
// 서류 (Documents)
// ============================================

export interface FirestoreDocument {
    id?: string;
    userId: string;
    userName: string;
    userPhone: string;
    userRegion: string;
    userSubRegion: string;
    userRole: string;
    itemId: string;       // m1, c1, etc
    title: string;        // 사업자등록증
    status: "pending" | "submitted" | "approved" | "rejected" | "hq_review";
    fileUrl?: string;
    fileName?: string;
    submittedAt?: Timestamp;
    cancelledAt?: Timestamp;
    reviewedAt?: Timestamp;
    reviewedBy?: string;
    rejectionReason?: string;
    managerRejectionReason?: string; // 영업소장 반려 사유
    verificationResult?: any; // Claude OCR 검증 결과 저장
    rejectionCount?: number;  // AI + 영업소장 + 본사 반려 누적 횟수
    rejectionType?: "document" | "extraction"; // 반려 유형 (서류 반려 vs 개인정보 추출 실패)
    reviewStage?: "manager" | "hq"; // 현재 심사 단계
    manualInputData?: Record<string, string>; // OCR Fallback 수동 입력 데이터
    dataSource?: "OCR" | "수동입력" | "OCR+수동보완"; // 데이터 출처
}

/**
 * 해당 사용자의 서류 목록 조회
 */
export async function getUserDocuments(userId: string): Promise<FirestoreDocument[]> {
    const q = query(
        collection(db, "documents"),
        where("userId", "==", userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreDocument));
}

/**
 * 서류 제출 (새로 생성 또는 기존 업데이트)
 * @param statusOverride - 기본 "submitted". OCR 부적격 시 "pending" 전달
 */
export async function submitDocument(data: {
    userId: string;
    userName: string;
    userPhone: string;
    userRegion: string;
    userSubRegion: string;
    userRole: string;
    itemId: string;
    title: string;
    fileUrl: string;
    fileName: string;
    verificationResult?: any;
    fileUrl2?: string;      // 두 번째 파일 (부속합의서)
    fileName2?: string;
    verificationResult2?: any;
    fileUrls?: string[];    // 다중 파일 (영업소 전경 사진 등)
    fileNames?: string[];
}, statusOverride?: "submitted" | "pending" | "approved" | "rejected" | "hq_review", rejectionCountIncrement?: number, rejectionType?: "document" | "extraction"): Promise<string> {
    const finalStatus = statusOverride || "submitted";

    console.log(`%c[submitDocument] 시작: userId="${data.userId}", itemId="${data.itemId}", title="${data.title}", status="${finalStatus}"`, 'color: blue; font-weight: bold');

    // 기존 제출 기록이 있는지 확인 (1차: userId + itemId)
    let snapshot = await getDocs(query(
        collection(db, "documents"),
        where("userId", "==", data.userId),
        where("itemId", "==", data.itemId)
    ));

    console.log(`[submitDocument] 1차 검색(userId+itemId): ${snapshot.docs.length}건 발견`);

    // 2차 폴백: 못 찾으면 이름+전화번호+itemId로 재검색
    if (snapshot.empty) {
        snapshot = await getDocs(query(
            collection(db, "documents"),
            where("userName", "==", data.userName),
            where("userPhone", "==", data.userPhone),
            where("itemId", "==", data.itemId)
        ));
        console.log(`[submitDocument] 2차 검색(이름+전화+itemId): ${snapshot.docs.length}건 발견`);
    }

    if (!snapshot.empty) {
        // 기존 문서 업데이트 (재업로드)
        const existingDoc = snapshot.docs[0];
        const existingData = existingDoc.data();
        const currentRejectionCount = existingData.rejectionCount || 0;
        const updateData: any = {
            userId: data.userId,
            userName: data.userName,
            userPhone: data.userPhone,
            userRegion: data.userRegion,
            userSubRegion: data.userSubRegion,
            userRole: data.userRole,
            status: finalStatus,
            title: data.title,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            submittedAt: serverTimestamp(),
            cancelledAt: null,
            verificationResult: data.verificationResult || null,
            rejectionCount: currentRejectionCount + (rejectionCountIncrement || 0),
        };
        if (rejectionType) {
            updateData.rejectionType = rejectionType;
        }
        // 반려 횟수 증가 시 관련 메타 초기화
        if (rejectionCountIncrement && rejectionCountIncrement > 0) {
            updateData.managerRejectionReason = null;
            updateData.reviewStage = null;
        }
        // 최종 승인 시 심사 단계 초기화
        if (finalStatus === "approved") {
            updateData.reviewStage = null;
        }
        // AI 반려 → 본사 직행(영업소장 서류)인 경우 reviewStage 설정
        if (finalStatus === "hq_review") {
            updateData.reviewStage = "hq";
        }
        // 두 번째 파일이 있으면 함께 저장
        if (data.fileUrl2) {
            updateData.fileUrl2 = data.fileUrl2;
            updateData.fileName2 = data.fileName2;
            updateData.verificationResult2 = data.verificationResult2 || null;
        }
        // 다중 파일 (갤러리)
        if (data.fileUrls && data.fileUrls.length > 0) {
            updateData.fileUrls = data.fileUrls;
            updateData.fileNames = data.fileNames;
        }
        await updateDoc(doc(db, "documents", existingDoc.id), updateData);
        console.log(`%c[submitDocument] ✅ 기존 문서 업데이트 완료: docId="${existingDoc.id}"`, 'color: green; font-weight: bold');

        // ↓ 여기 추가: 중복 문서 정리 (최신 1건만 남기고 삭제)
        if (snapshot.docs.length > 1) {
            const sorted = [...snapshot.docs].sort((a, b) => {
                const ta = a.data().submittedAt?.toDate?.()?.getTime?.() || 0;
                const tb = b.data().submittedAt?.toDate?.()?.getTime?.() || 0;
                return tb - ta;
            });
            // sorted[0]이 방금 업데이트한 최신본, 나머지 삭제
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].id !== existingDoc.id) {
                    await deleteDoc(doc(db, "documents", sorted[i].id));
                }
            }
        }

        return existingDoc.id;
    }

    // 새 서류 제출
    const docRef = await addDoc(collection(db, "documents"), {
        ...data,
        status: finalStatus,
        submittedAt: serverTimestamp(),
        rejectionCount: rejectionCountIncrement || 0,
        rejectionType: rejectionType || null,
        ...(finalStatus === "hq_review" ? { reviewStage: "hq" } : {}),
    });
    console.log(`%c[submitDocument] ✅ 새 문서 생성 완료: docId="${docRef.id}"`, 'color: green; font-weight: bold');
    return docRef.id;
}

/**
 * 서류 업로드 취소 — 상태를 pending으로 복원하고 모든 데이터를 초기화
 */
export const cancelDocument = async (documentId: string): Promise<void> => {
    const docRef = doc(db, "documents", documentId);
    await updateDoc(docRef, {
        status: "pending",
        cancelledAt: serverTimestamp(),
        fileUrl: null,
        fileName: null,
        fileUrl2: null,
        fileName2: null,
        fileUrls: null,
        fileNames: null,
        verificationResult: null,
        verificationResult2: null,
        rejectionReason: null
    });
};

/**
 * 서류 승인/반려 (영업소장 전용)
 * - approved: 최종 승인
 * - rejected_to_hq: 영업소장 반려 → 본사 2차 심사 이관 (status: "hq_review", rejectionCount+1)
 */
export async function reviewDocument(
    documentId: string,
    action: "approved" | "rejected" | "rejected_to_hq",
    reviewedBy: string,
    rejectionReason?: string
): Promise<void> {
    if (action === "rejected_to_hq") {
        // 영업소장 반려 → 본사 이관
        const docRef = doc(db, "documents", documentId);
        const snap = await getDoc(docRef);
        const currentCount = (snap.data()?.rejectionCount || 0);
        await updateDoc(docRef, {
            status: "hq_review",
            reviewedAt: serverTimestamp(),
            reviewedBy,
            reviewStage: "hq",
            managerRejectionReason: rejectionReason || "서류 내용 불일치",
            rejectionCount: currentCount + 1,
        });
    } else {
        const docRef = doc(db, "documents", documentId);
        if (action === "rejected") {
            const snap = await getDoc(docRef);
            const currentCount = (snap.data()?.rejectionCount || 0);
            await updateDoc(docRef, {
                status: action,
                reviewedAt: serverTimestamp(),
                reviewedBy,
                rejectionReason: rejectionReason || "서류 부적합",
                rejectionCount: currentCount + 1,
            });
        } else {
            await updateDoc(docRef, {
                status: action,
                reviewedAt: serverTimestamp(),
                reviewedBy,
            });
        }
    }
}

/**
 * 서류 최종 승인/반려 (본사 관리자 전용)
 * - approved: 최종 승인
 * - rejected: 본사 반려 → 기사 재제출 요청 (rejectionCount+1)
 */
export async function reviewDocumentByHQ(
    documentId: string,
    action: "approved" | "rejected",
    rejectionReason?: string
): Promise<void> {
    const docRef = doc(db, "documents", documentId);
    const snap = await getDoc(docRef);
    const currentCount = (snap.data()?.rejectionCount || 0);
    await updateDoc(docRef, {
        status: action,
        reviewedAt: serverTimestamp(),
        reviewedBy: "hq_admin",
        reviewStage: null,
        ...(action === "rejected" ? {
            rejectionReason: rejectionReason || "서류 부적합",
            rejectionCount: currentCount + 1,
        } : {}),
    });
}

/**
 * 전체 제출 서류 목록 (관리자 대시보드용)
 */
export async function getAllSubmissions(): Promise<FirestoreDocument[]> {
    const q = query(
        collection(db, "documents"),
        where("status", "==", "submitted")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreDocument));
}

/**
 * 본사 2차 심사 대기 서류 목록
 */
export async function getHQReviewDocuments(): Promise<FirestoreDocument[]> {
    const q = query(
        collection(db, "documents"),
        where("status", "==", "hq_review")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreDocument));
}

/**
 * 모든 서류 조회 (상태 무관)
 */
export async function getAllDocuments(): Promise<FirestoreDocument[]> {
    const snapshot = await getDocs(collection(db, "documents"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreDocument));
}

/**
 * 특정 영업소의 택배기사 서류 조회 (영업소장 대시보드용)
 * subRegion이 동일하고, 본인(영업소장) 서류가 아닌 것 반환
 */
export async function getDocumentsBySubRegion(subRegion: string, excludeUserId?: string): Promise<FirestoreDocument[]> {
    const q = query(
        collection(db, "documents"),
        where("userSubRegion", "==", subRegion)
    );
    const snapshot = await getDocs(q);

    let docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreDocument));
    if (excludeUserId) {
        docs = docs.filter(d => d.userId !== excludeUserId);
    }
    return docs;
}

// ============================================
// 관리자 오버라이드 (Admin Overrides)
// ============================================

export interface AdminOverride {
    total: number;
    submitted: number;
    notes: string;
    updatedAt?: Timestamp;
}

/**
 * 관리자 오버라이드 저장
 */
export async function saveAdminOverride(
    subRegion: string,
    data: Omit<AdminOverride, "updatedAt">
): Promise<void> {
    const docId = encodeURIComponent(subRegion);
    await setDoc(doc(db, "admin_overrides", docId), {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

/**
 * 전체 오버라이드 조회
 */
export async function getAllAdminOverrides(): Promise<Record<string, AdminOverride>> {
    const snapshot = await getDocs(collection(db, "admin_overrides"));
    const result: Record<string, AdminOverride> = {};
    snapshot.docs.forEach(d => {
        const key = decodeURIComponent(d.id);
        result[key] = d.data() as AdminOverride;
    });
    return result;
}

// ============================================
// 통계 유틸리티
// ============================================

/**
 * 영업소별 실제 제출 통계 계산 (Firestore 데이터 기반)
 */
export async function calculateRegionalStats(): Promise<{
    bySubRegion: Record<string, { total: number; submitted: number }>;
    overall: { total: number; submitted: number; rate: number };
}> {
    const allDocs = await getAllDocuments();
    const bySubRegion: Record<string, { total: number; submitted: number }> = {};

    allDocs.forEach(d => {
        const key = d.userSubRegion;
        if (!bySubRegion[key]) {
            bySubRegion[key] = { total: 0, submitted: 0 };
        }
        bySubRegion[key].total++;
        if (d.status === "submitted" || d.status === "approved") {
            bySubRegion[key].submitted++;
        }
    });

    const overall = Object.values(bySubRegion).reduce(
        (acc, v) => ({ total: acc.total + v.total, submitted: acc.submitted + v.submitted }),
        { total: 0, submitted: 0 }
    );

    return {
        bySubRegion,
        overall: {
            ...overall,
            rate: overall.total > 0 ? Math.round((overall.submitted / overall.total) * 100) : 0,
        },
    };
}