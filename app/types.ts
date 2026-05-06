export type Role = "admin" | "manager" | "courier" | "driver";

export type DocumentStatus = "pending" | "submitted" | "approved" | "rejected";

export interface User {
    id: string;
    name: string;
    phone: string;
    role: Role;
    region: string; // e.g., "양지센터", "부산1영업소"
    subRegion?: string; // e.g., "B2C", "B2B"
    agencyName?: string; // For managers/couriers
}

export interface DocumentItem {
    id: string;
    title: string;
    type: "image" | "pdf";
    required: boolean;
    status: DocumentStatus;
    submittedAt?: string;
    rejectionReason?: string;
    extractedData?: Record<string, string>; // OCR Data
}

export interface CourierStats {
    total: number;
    submitted: number;
    rate: number;
}

export interface RegionalStat {
    region: string; // Center Name
    subRegion: string; // Branch/Agency Name
    managerName: string;
    stats: CourierStats;
}
