import * as XLSX from 'xlsx';
import { StorageService } from './storage';

export function exportMealRecordsToExcel(): { success: boolean; filename: string } {
  const participants = StorageService.getParticipants();
  const meals = StorageService.getMeals();
  const logs = StorageService.getLogs();

  // 1. Sheet 1: Master Attendance Matrix
  // Map participant -> { mealId: log }
  const logsByParticipant = new Map<number, Map<string, typeof logs[0]>>();
  logs.forEach((log) => {
    if (!logsByParticipant.has(log.participantUid)) {
      logsByParticipant.set(log.participantUid, new Map());
    }
    logsByParticipant.get(log.participantUid)!.set(log.mealId, log);
  });

  const matrixData = participants.map((p) => {
    const pLogs = logsByParticipant.get(p.uid);
    const row: Record<string, string | number> = {
      'Participant UID': p.uid,
      'Full Name': p.name,
      'Team': p.team,
      'Dietary Preference': p.dietary || 'Regular'
    };

    let totalFed = 0;
    meals.forEach((m) => {
      const log = pLogs?.get(m.id);
      if (log) {
        totalFed += 1;
        const timeFormatted = new Date(log.scannedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        row[m.name] = `FED (${timeFormatted})`;
      } else {
        row[m.name] = 'NOT SERVED';
      }
    });

    row['Total Meals Served'] = `${totalFed} / ${meals.length}`;
    row['Attendance Status'] = totalFed === meals.length ? 'ALL MEALS COMPLETED' : totalFed > 0 ? 'PARTIALLY SERVED' : 'UNTOUCHED';

    return row;
  });

  // 2. Sheet 2: Raw Scan Audit Logs
  const auditLogsData = logs.map((log, index) => {
    const dateObj = new Date(log.scannedAt);
    return {
      '#': index + 1,
      'Log ID': log.id,
      'Date & Time': dateObj.toLocaleString(),
      'Participant UID': log.participantUid,
      'Participant Name': log.participantName,
      'Team': log.team,
      'Meal Served': log.mealName,
      'Verified By (Volunteer USN)': log.scannedByUsn
    };
  });

  // 3. Sheet 3: Team-Level Summary
  const teamStatsMap = new Map<string, {
    total: number;
    mealCounts: Record<string, number>;
  }>();

  participants.forEach((p) => {
    if (!teamStatsMap.has(p.team)) {
      const initialMealCounts: Record<string, number> = {};
      meals.forEach((m) => {
        initialMealCounts[m.name] = 0;
      });
      teamStatsMap.set(p.team, { total: 0, mealCounts: initialMealCounts });
    }
    const stat = teamStatsMap.get(p.team)!;
    stat.total += 1;
  });

  logs.forEach((log) => {
    const stat = teamStatsMap.get(log.team);
    if (stat && stat.mealCounts[log.mealName] !== undefined) {
      stat.mealCounts[log.mealName] += 1;
    }
  });

  const teamSummaryData: Record<string, string | number>[] = [];
  teamStatsMap.forEach((stat, teamName) => {
    const row: Record<string, string | number> = {
      'Team Name': teamName,
      'Total Members': stat.total
    };
    let totalTeamMeals = 0;
    meals.forEach((m) => {
      const served = stat.mealCounts[m.name] || 0;
      totalTeamMeals += served;
      const pct = stat.total > 0 ? Math.round((served / stat.total) * 100) : 0;
      row[`${m.name} Fed`] = `${served}/${stat.total} (${pct}%)`;
    });
    const maxPossibleMeals = stat.total * meals.length;
    const overallPct = maxPossibleMeals > 0 ? Math.round((totalTeamMeals / maxPossibleMeals) * 100) : 0;
    row['Overall Meal Fulfillment'] = `${overallPct}%`;
    teamSummaryData.push(row);
  });

  // 4. Sheet 4: Archived meals (data stored automatically when each meal ended)
  const history = StorageService.getMealHistory();
  const historyData = history.flatMap((h) =>
    h.logs.map((log) => ({
      'Meal': h.mealName,
      'Archived At': new Date(h.archivedAt).toLocaleString(),
      'Scanned At': new Date(log.scannedAt).toLocaleString(),
      'Participant UID': log.participantUid,
      'Participant Name': log.participantName,
      'Team': log.team,
      'Verified By (Volunteer USN)': log.scannedByUsn
    }))
  );

  // Build Workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheets
  const wsMatrix = XLSX.utils.json_to_sheet(matrixData);
  const wsAudit = XLSX.utils.json_to_sheet(auditLogsData);
  const wsTeam = XLSX.utils.json_to_sheet(teamSummaryData);

  // Auto-width helper
  const setColWidths = (ws: XLSX.WorkSheet, data: Record<string, unknown>[]) => {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    ws['!cols'] = keys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => String(row[key] || '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
    });
  };

  setColWidths(wsMatrix, matrixData);
  setColWidths(wsAudit, auditLogsData);
  setColWidths(wsTeam, teamSummaryData);

  // Append sheets
  XLSX.utils.book_append_sheet(workbook, wsMatrix, 'Meal Attendance Matrix');
  XLSX.utils.book_append_sheet(workbook, wsTeam, 'Team Summary');
  XLSX.utils.book_append_sheet(workbook, wsAudit, 'Scan Audit Log');
  if (historyData.length > 0) {
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    setColWidths(wsHistory, historyData);
    XLSX.utils.book_append_sheet(workbook, wsHistory, 'Archived Meals');
  }

  // File name with ISO timestamp
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `Event_Meal_Service_Report_${dateStr}_${timeStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
  return { success: true, filename };
}
