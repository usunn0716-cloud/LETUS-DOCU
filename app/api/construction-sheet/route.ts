import { NextResponse } from 'next/server';
import {
    savePersonalInfo,
    updateVehicleInfo,
    getConstructionTeams,
    updateConstructionTeamStatus,
    deleteConstructionTeamRow,
    verifyRegionPassword,
    getRegionPasswords,
    updateRegionPassword,
    updateDocumentLinks,
} from '@/lib/googleSheetsConstruction';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const center = url.searchParams.get('center') || undefined;
        const subRegion = url.searchParams.get('subRegion') || undefined;

        const teams = await getConstructionTeams(center, subRegion);
        return NextResponse.json(teams);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const data = await request.json();

        // 상태 변경
        if (data.action === 'updateStatus') {
            await updateConstructionTeamStatus(data.rowIndex, data.status, data.role);
            return NextResponse.json({ success: true });
        }

        // 차량정보만 업데이트
        if (data.action === 'updateVehicle') {
            await updateVehicleInfo(data);
            return NextResponse.json({ success: true });
        }

        // 권역장 직접 정보 수정
        if (data.action === 'updateTeam') {
            const { updateConstructionTeam } = await import('@/lib/googleSheetsConstruction');
            await updateConstructionTeam(data.rowIndex, data.role, data.fields);
            return NextResponse.json({ success: true });
        }

        // 서류 링크 업데이트 (Firebase URL → 시공팀등록현황 시트)
        if (data.action === 'updateDocumentLinks') {
            await updateDocumentLinks({
                name: data.name,
                birthday: data.birthday,
                phone: data.phone,
                docType: data.docType,
                fileUrl: data.fileUrl,
                center: data.center,
                subRegion: data.subRegion,
                role: data.role,
            });
            return NextResponse.json({ success: true });
        }

        // 수동 입력 데이터 → Google Sheets 기록
        if (data.action === 'manualInput') {
            const { updateOCRData } = await import('@/lib/googleSheetsConstruction');
            if (data.docType && data.rowData) {
                // data.rowData는 ManualInputModal에서 넘어온 formData(즉, extractedData 형식)
                await updateOCRData({
                    name: data.name,
                    birthday: data.userBirthday,
                    phone: data.phone,
                    docType: data.docType,
                    extractedData: data.rowData,
                    role: data.role,
                    center: data.center,
                    subRegion: data.subRegion,
                });
            }
            return NextResponse.json({ success: true });
        }

        // 권역장 비밀번호 검증
        if (data.action === 'verifyPassword') {
            const valid = await verifyRegionPassword(data.subRegion, data.password);
            return NextResponse.json({ valid });
        }

        // 권역장 비밀번호 전체 조회 (LETUS 관리자용)
        if (data.action === 'getPasswords') {
            const passwords = await getRegionPasswords();
            return NextResponse.json(passwords);
        }

        // 권역장 비밀번호 변경 (LETUS 관리자용)
        if (data.action === 'updatePassword') {
            const success = await updateRegionPassword(data.subRegion, data.newPassword);
            return NextResponse.json({ success });
        }

        // 기본: 개인정보 저장
        await savePersonalInfo(data);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const url = new URL(request.url);
        const rowIndex = url.searchParams.get('rowIndex');
        const role = url.searchParams.get('role') || undefined;

        if (!rowIndex) {
            return NextResponse.json({ error: 'rowIndex is required' }, { status: 400 });
        }

        await deleteConstructionTeamRow(parseInt(rowIndex, 10), role);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
