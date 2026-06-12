import { NextRequest, NextResponse } from 'next/server';
import {
  applyStatusAction,
  getStatusForFile,
  readDienstplanStatusMap,
  touchLastChangedTimestamp,
  writeDienstplanStatusMap,
} from '@/lib/dienstplan-status';

type StatusAction = 'release' | 'unrelease' | 'archive' | 'restore';

function isValidAction(value: unknown): value is StatusAction {
  return value === 'release' || value === 'unrelease' || value === 'archive' || value === 'restore';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    const action = body.action;

    if (!fileName) {
      return NextResponse.json({ error: 'Dateiname erforderlich' }, { status: 400 });
    }

    if (!isValidAction(action)) {
      return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
    }

    const statusMap = await readDienstplanStatusMap();
    const currentStatus = getStatusForFile(statusMap, fileName);
    const nextStatus = applyStatusAction(currentStatus, action);

    statusMap[fileName] = nextStatus;
    await writeDienstplanStatusMap(statusMap);
    await touchLastChangedTimestamp();

    return NextResponse.json({
      success: true,
      fileName,
      status: {
        released: nextStatus.released,
        archived: nextStatus.archived,
        releasedAt: nextStatus.releasedAt,
        archivedAt: nextStatus.archivedAt,
        updatedAt: nextStatus.updatedAt,
      },
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Dienstplan-Status:', error);
    return NextResponse.json(
      { error: 'Status konnte nicht aktualisiert werden' },
      { status: 500 }
    );
  }
}
