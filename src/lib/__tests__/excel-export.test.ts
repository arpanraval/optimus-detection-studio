import { Blob as NodeBlob } from 'node:buffer';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadExcel } from '../../components/export-utils';
import { generateReportExcel } from '../../components/exercises/export/generateReportExcel';
import { generateAdvisoryExcel } from '../../components/exercises/export/generateAdvisoryExcel';
import type { StateSponsoredReport } from '../../components/exercises/types';
import { NavigatorService } from '../mitre/NavigatorService';

let download: NodeBlob | undefined;
beforeEach(() => {
  download = undefined;
  vi.stubGlobal('Blob', NodeBlob);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  URL.createObjectURL = vi.fn((blob: Blob) => {
    download = blob as unknown as NodeBlob;
    return 'blob:export';
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const report: StateSponsoredReport = {
  filterDescription: 'Regression fixture',
  generatedAt: new Date(),
  activeFilters: { originCountries: [], targetCountries: [], targetSectors: [], activityTypes: [] },
  groups: [],
  allTechniques: [],
  coveredTechniqueIds: new Set(),
  uncoveredTechniqueIds: new Set(),
  coveragePercent: 0,
  riskRating: 'Low',
  tacticBreakdown: [],
  relatedDetections: [],
  gaps: [],
  software: [],
  campaigns: [],
  targetSectors: [],
  targetCountries: [],
};

it.each([
  ['detection library', () => downloadExcel([], 'detections.xlsx')],
  ['coverage navigator', () => NavigatorService.generateExcelExport({})],
  ['exercise report', () => generateReportExcel(report)],
  ['threat advisory', () => generateAdvisoryExcel(report)],
] as const)('generates a readable Excel workbook after lazy loading (%s)', async (_name, exportFile) => {
  await exportFile();
  expect(download?.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook = new ExcelJS.Workbook();
  // ExcelJS accepts Node Buffers, but its bundled Buffer declaration extends
  // ArrayBuffer. Normalize the jsdom/native realm boundary before reading.
  const bytes = Buffer.from(await download!.arrayBuffer());
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  expect(workbook.worksheets.length).toBeGreaterThan(0);
  expect(workbook.worksheets[0].rowCount).toBeGreaterThan(0);
});
