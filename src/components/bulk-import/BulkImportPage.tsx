/**
 * BulkImportPage - Main page for bulk import functionality
 * Uses app's M3 design system
 *
 * Supports minimizing the wizard to a compact progress bar while
 * the import continues in the background.
 */

import React, { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BulkImportProvider, useBulkImportContext } from '../../context/BulkImportContext';
import { useGlobalImport } from '../../context/GlobalImportContext';
import { BulkImportWizard } from './BulkImportWizard';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';
import { ImportSourceType } from '../../services/bulk-import/types';

function BulkImportContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, progress, rules, job, result, reset } = useBulkImportContext();
  const globalImport = useGlobalImport();

  // Sync Arsenal job state up to the global context so the background bar works
  useEffect(() => {
    if (['fetching', 'parsing', 'validating', 'inserting', 'complete'].includes(status)) {
      // Map Arsenal's local status to global status appropriately
      const globalStatus = status === 'inserting' ? 'importing' : status as any;
      globalImport.syncExternalJob(globalStatus, progress, job, result);
    }
  }, [status, progress, job, result, globalImport.syncExternalJob]);

  // Get pre-selected source type from URL params
  const sourceParam = searchParams.get('source');
  const preSelectedSource: ImportSourceType | undefined =
    sourceParam === 'files' ? 'files' :
    sourceParam === 'zip' ? 'zip' :
    sourceParam === 'github' ? 'github' :
    undefined;

  // Get page title based on source type
  const getPageTitle = () => {
    switch (preSelectedSource) {
      case 'files':
        return 'Import from Files';
      case 'zip':
        return 'Import from ZIP';
      case 'github':
        return 'Import from GitHub';
      default:
        return 'Bulk Import';
    }
  };

  const totalRules = rules.filter((r) => r.selected).length;
  const isActive = ['fetching', 'parsing', 'validating', 'inserting'].includes(status);

  const handleMinimize = useCallback(() => {
    if (isActive) {
      if (status === 'inserting') {
        globalImport.takeOverJob();
      }
      globalImport.minimize();
      navigate('/');
    }
  }, [isActive, status, globalImport, navigate]);

  const handleExpand = useCallback(() => {
    globalImport.expand();
  }, [globalImport]);

  const handleCancel = useCallback(() => {
    if (window.confirm('Are you sure you want to cancel the import? Progress will be lost.')) {
      reset();
      globalImport.expand();
    }
  }, [reset, globalImport]);

  // Navigate back to Add Detection page when wizard is closed
  const handleClose = useCallback(() => {
    navigate(ROUTES.DETECTION_NEW);
  }, [navigate]);

  // Get source name for display
  const sourceName = job?.config.sourceType === 'zip'
    ? job?.config.sourceZip?.name
    : job?.config.sourceType === 'github'
    ? job?.config.sourceUrl?.replace('https://github.com/', '')
    : job?.config.sourceFiles?.length
    ? `${job.config.sourceFiles.length} files`
    : undefined;

  return (
    <>
      {/* Main wizard - hidden when minimized during active operation */}
      {(!globalImport.isMinimized || !isActive) && (
        <div className="h-full bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header with back and minimize buttons */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
                  title="Back to Library"
                >
                  <Icon name="arrow-left" className="w-4 h-4" />
                  <span className="hidden md:inline">Back</span>
                </button>
                <h1 className="text-2xl font-bold text-on-surface">{getPageTitle()}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(ROUTES.IMPORT_HISTORY)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
                  title="View import history"
                >
                  <Icon name="history" className="w-4 h-4" />
                  <span className="hidden md:inline">History</span>
                </button>
                {isActive && (
                  <button
                    onClick={handleMinimize}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
                    title="Minimize to background"
                  >
                    <Icon name="minimize-2" className="w-4 h-4" />
                    <span className="hidden md:inline">Minimize</span>
                  </button>
                )}
              </div>
            </div>

            <BulkImportWizard onClose={handleClose} preSelectedSource={preSelectedSource} />
          </div>
        </div>
      )}

      {/* Placeholder content when minimized */}
      {globalImport.isMinimized && isActive && (
        <div className="h-full bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-container/30 mb-4">
              <Icon name="download" className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <h2 className="text-lg font-medium text-on-surface">Import in Progress</h2>
            <p className="text-sm text-on-surface-variant mt-2">
              Your import is running in the background.
            </p>
            <button
              onClick={handleExpand}
              className="mt-4 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-container/30 rounded-full transition-colors"
            >
              View Progress
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function BulkImportPage() {
  return (
    <BulkImportProvider>
      <BulkImportContent />
    </BulkImportProvider>
  );
}
