/**
 * SourceSelectionStep - First step for selecting import source
 * Uses app's M3 design system
 *
 * Can accept a pre-selected source type to skip the source type selection.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import { ImportSourceType, ImportJobConfig, DuplicateStrategy, VendorFormat } from '../../../services/bulk-import/types';
import { LibraryType } from '../../../types';
import { LIBRARY_LABELS } from '../../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION } from '../../../constants/library';
import { useAppData } from '../../../router/AppDataContext';
import { Icon } from '../../Icon';

// Brand color for wizard
const BRAND_COLOR = '#783264';

interface SourceSelectionStepProps {
  /** Pre-selected source type - hides source type selection when provided */
  preSelectedSource?: ImportSourceType;
}

interface DuplicateOption {
  id: DuplicateStrategy;
  label: string;
  description: string;
  icon: string;
}

const DUPLICATE_OPTIONS: DuplicateOption[] = [
  {
    id: 'skip',
    label: 'Skip Duplicates',
    description: 'Keep existing rules, skip new ones with same ID',
    icon: 'chevron-right',
  },
  {
    id: 'update',
    label: 'Update Existing',
    description: 'Replace existing rules with imported versions',
    icon: 'refresh-cw',
  },
  {
    id: 'create_new',
    label: 'Create New Version',
    description: 'Import as new rules even if duplicates exist',
    icon: 'copy',
  },
];

interface SourceOption {
  id: ImportSourceType;
  label: string;
  description: string;
  icon: string;
  disabled?: boolean;
}

interface VendorOption {
  id: 'auto' | VendorFormat;
  label: string;
  description: string;
  icon: string;
}

const VENDOR_OPTIONS: VendorOption[] = [
  {
    id: 'auto',
    label: 'Auto-Detect',
    description: 'Automatically identify the vendor format from file content',
    icon: 'zap',
  },
  {
    id: 'sigma',
    label: 'Sigma',
    description: 'Generic YAML detection rules (SigmaHQ)',
    icon: 'shield',
  },
  {
    id: 'splunk_escu',
    label: 'Splunk ESCU',
    description: 'Splunk Enterprise Security Content Update',
    icon: 'database',
  },
  {
    id: 'elastic',
    label: 'Elastic',
    description: 'Elastic detection rules (TOML format)',
    icon: 'search',
  },
  {
    id: 'kql',
    label: 'Microsoft Sentinel',
    description: 'Kusto Query Language analytics rules',
    icon: 'cloud',
  },
  {
    id: 'crowdstrike_cql',
    label: 'CrowdStrike',
    description: 'CrowdStrike Query Language detections',
    icon: 'crosshair',
  },
  {
    id: 'chronicle',
    label: 'Chronicle',
    description: 'Google Chronicle YARA-L rules',
    icon: 'layers',
  },
];

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: 'zip',
    label: 'ZIP Archive',
    description: 'Upload a ZIP file containing detection rules (Sigma, Splunk ESCU)',
    icon: 'archive',
  },
  {
    id: 'files',
    label: 'Individual Files',
    description: 'Upload one or more YAML/JSON detection rule files',
    icon: 'file-text',
  },
  {
    id: 'github',
    label: 'GitHub Repository',
    description: 'Import directly from a public GitHub repository',
    icon: 'github',
  },
];

export function SourceSelectionStep({ preSelectedSource }: SourceSelectionStepProps = {}) {
  const { createJob, setCurrentStep, githubToken, setGithubToken, saveGithubToken, clearSavedGithubToken } = useBulkImportContext();
  const { profile } = useAppData();
  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const [selectedSource, setSelectedSource] = useState<ImportSourceType>(preSelectedSource || 'zip');
  const [selectedVendor, setSelectedVendor] = useState<'auto' | VendorFormat>('auto');
  const [targetLibrary, setTargetLibrary] = useState<LibraryType>(LIBRARY_DEVELOPMENT);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [files, setFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(!!githubToken);
  const [tokenValue, setTokenValue] = useState(githubToken || '');
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(!!githubToken);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Whether to show the source type selector (hide when pre-selected)
  const showSourceTypeSelector = !preSelectedSource;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedSource === 'zip') {
      const zip = selectedFiles.find((f) => f.name.endsWith('.zip'));
      if (zip) {
        const MAX_ZIP_SIZE = 200 * 1024 * 1024; // 200MB
        if (zip.size > MAX_ZIP_SIZE) {
          setError(`ZIP file too large (${(zip.size / 1024 / 1024).toFixed(0)}MB). Maximum is 200MB.`);
          return;
        }
        setZipFile(zip);
        setError(null);
      } else {
        setError('Please select a ZIP file');
      }
    } else {
      setFiles(selectedFiles);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (selectedSource === 'zip') {
      const zip = droppedFiles.find((f) => f.name.endsWith('.zip'));
      if (zip) {
        setZipFile(zip);
        setError(null);
      }
    } else {
      const supportedExts = ['.yml', '.yaml', '.toml', '.yaral', '.yar', '.kql'];
      setFiles(droppedFiles.filter((f) => supportedExts.some((ext) => f.name.toLowerCase().endsWith(ext))));
      setError(null);
    }
  };

  const handleStartImport = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const config: ImportJobConfig = {
        sourceType: selectedSource,
        targetLibrary,
        duplicateStrategy,
        ...(selectedVendor !== 'auto' && {
          vendor: selectedVendor,
          vendorFilter: [selectedVendor],
        }),
      };

      if (selectedSource === 'zip' && zipFile) {
        config.sourceZip = zipFile;
      } else if (selectedSource === 'files' && files.length > 0) {
        config.sourceFiles = files;
      } else if (selectedSource === 'github' && githubUrl) {
        config.sourceUrl = githubUrl;
        // Apply GitHub token
        const effectiveToken = tokenValue.trim() || githubToken;
        if (effectiveToken) {
          config.githubToken = effectiveToken;
          setGithubToken(effectiveToken);
          if (rememberToken) {
            saveGithubToken(effectiveToken);
          }
        }
      } else {
        setError('Please provide a valid source for import');
        setIsLoading(false);
        return;
      }

      createJob(config);
      // Navigate to recon step instead of directly parsing
      setCurrentStep('recon');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed =
    (selectedSource === 'zip' && zipFile) ||
    (selectedSource === 'files' && files.length > 0) ||
    (selectedSource === 'github' && githubUrl.includes('github.com/'));

  return (
    <div className="space-y-8">
      {/* Source type selection - only show when not pre-selected */}
      {showSourceTypeSelector && (
        <div>
          <h3 className="text-lg font-semibold text-on-surface mb-4">Select Import Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SOURCE_OPTIONS.map((option) => {
              const isSelected = selectedSource === option.id;

              return (
                <button
                  key={option.id}
                  onClick={() => {
                    if (!option.disabled) {
                      setSelectedSource(option.id);
                      setFiles([]);
                      setZipFile(null);
                    }
                  }}
                  disabled={option.disabled}
                  className={`relative p-5 rounded-[16px] border-2 text-left transition-all ${
                    option.disabled
                      ? 'opacity-50 cursor-not-allowed border-outline-variant/20'
                      : isSelected
                      ? 'border-outline-variant/30 hover:bg-surface-container'
                      : 'border-outline-variant/30 hover:border-outline-variant/50 hover:bg-surface-container'
                  }`}
                  style={isSelected && !option.disabled ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}15` } : {}}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="p-3 rounded-full transition-colors"
                      style={isSelected ? { backgroundColor: BRAND_COLOR, color: 'white' } : { backgroundColor: 'var(--surface-variant)', color: 'var(--on-surface-variant)' }}
                    >
                      <Icon name={option.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p
                        className="font-semibold"
                        style={{ color: isSelected ? BRAND_COLOR : 'var(--on-surface)' }}
                      >
                        {option.label}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">{option.description}</p>
                    </div>
                  </div>
                  {option.disabled && (
                    <span className="absolute top-3 right-3 text-[10px] font-bold bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Coming Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Source input - varies by type */}
      <div>
        <h3 className="text-lg font-semibold text-on-surface mb-4">
          {selectedSource === 'zip'
            ? 'Upload ZIP File'
            : selectedSource === 'github'
            ? 'GitHub Repository URL'
            : 'Upload Files'}
        </h3>

        {/* GitHub URL input */}
        {selectedSource === 'github' ? (
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Icon name="github" className="w-5 h-5 text-on-surface-variant" />
              </div>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => {
                  setGithubUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://github.com/SigmaHQ/sigma"
                className="w-full pl-12 pr-4 py-3 bg-surface-container border border-outline-variant/30 rounded-[12px] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              Paste a GitHub repository URL. Supports public repositories from SigmaHQ, Splunk Security Content, and more.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGithubUrl('https://github.com/SigmaHQ/sigma')}
                className="text-xs px-3 py-1.5 bg-surface-variant hover:bg-surface-variant/70 rounded-full text-on-surface-variant transition-colors"
              >
                SigmaHQ/sigma
              </button>
              <button
                type="button"
                onClick={() => setGithubUrl('https://github.com/splunk/security_content')}
                className="text-xs px-3 py-1.5 bg-surface-variant hover:bg-surface-variant/70 rounded-full text-on-surface-variant transition-colors"
              >
                splunk/security_content
              </button>
            </div>

            {/* Advanced options - GitHub PAT */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} className="w-3.5 h-3.5" />
                Advanced Options
                {githubToken && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-700">Token set</span>}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-4 rounded-[12px] bg-surface-container border border-outline-variant/20 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-on-surface mb-1 block">
                      GitHub Personal Access Token
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={tokenValue}
                        onChange={(e) => setTokenValue(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full pr-16 pl-3 py-2 bg-surface border border-outline-variant/30 rounded-[8px] text-sm text-on-surface font-mono placeholder:text-on-surface-variant/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface px-2 py-1"
                      >
                        {showToken ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Increases rate limit from 60 to 5,000 requests/hour. Required for large repos.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberToken}
                      onChange={(e) => {
                        setRememberToken(e.target.checked);
                        if (!e.target.checked) clearSavedGithubToken();
                      }}
                      className="rounded border-outline-variant"
                    />
                    <span className="text-xs text-on-surface-variant">Remember token for future imports</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            onClick={() => (selectedSource === 'zip' ? zipInputRef : fileInputRef).current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed rounded-[16px] p-8 text-center cursor-pointer transition-all"
            style={{
              borderColor: (selectedSource === 'zip' ? zipFile : files.length > 0) ? BRAND_COLOR : 'rgba(var(--outline-variant), 0.5)',
              backgroundColor: (selectedSource === 'zip' ? zipFile : files.length > 0) ? `${BRAND_COLOR}10` : 'transparent',
            }}
          >
          {selectedSource === 'zip' ? (
            <>
              {zipFile ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: `${BRAND_COLOR}30`, color: BRAND_COLOR }}>
                    <Icon name="check-circle" className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-on-surface">{zipFile.name}</p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setZipFile(null);
                    }}
                    className="text-sm text-error hover:underline"
                  >
                    Clear selection
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-variant text-on-surface-variant">
                    <Icon name="archive" className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-on-surface">Drop a ZIP file here</p>
                    <p className="text-sm text-on-surface-variant mt-1">or click to browse</p>
                  </div>
                  <p className="text-xs text-on-surface-variant/70">
                    Supports Sigma (sigma-master.zip), Splunk ESCU (security_content.zip)
                  </p>
                </div>
              )}
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          ) : (
            <>
              {files.length > 0 ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: `${BRAND_COLOR}30`, color: BRAND_COLOR }}>
                    <Icon name="check-circle" className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-on-surface">
                      {files.length} file{files.length > 1 ? 's' : ''} selected
                    </p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {files.slice(0, 3).map((f) => f.name).join(', ')}
                      {files.length > 3 && ` and ${files.length - 3} more`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                    }}
                    className="text-sm text-error hover:underline"
                  >
                    Clear selection
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-variant text-on-surface-variant">
                    <Icon name="file-text" className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-medium text-on-surface">Drop YAML files here</p>
                    <p className="text-sm text-on-surface-variant mt-1">or click to browse</p>
                  </div>
                  <p className="text-xs text-on-surface-variant/70">Supports .yml, .yaml, .toml, .yaral, .yar, .kql files</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".yml,.yaml,.toml,.yaral,.yar,.kql"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}
          </div>
        )}
      </div>

      {/* Vendor format selection */}
      <div>
        <h3 className="text-lg font-semibold text-on-surface mb-2">Vendor Format</h3>
        <p className="text-sm text-on-surface-variant mb-4">
          Select the detection format, or let auto-detect identify it from file content.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {VENDOR_OPTIONS.map((option) => {
            const isSelected = selectedVendor === option.id;

            return (
              <button
                key={option.id}
                onClick={() => setSelectedVendor(option.id)}
                className={`p-4 rounded-[12px] border-2 text-left transition-all ${
                  isSelected
                    ? ''
                    : 'border-outline-variant/30 hover:border-outline-variant/50 hover:bg-surface-container'
                }`}
                style={isSelected ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}15` } : {}}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-full transition-colors ${
                      isSelected
                        ? 'text-white'
                        : 'bg-surface-variant text-on-surface-variant'
                    }`}
                    style={isSelected ? { backgroundColor: BRAND_COLOR } : {}}
                  >
                    <Icon name={option.icon} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium text-sm ${
                        isSelected ? '' : 'text-on-surface'
                      }`}
                      style={isSelected ? { color: BRAND_COLOR } : {}}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target library selection */}
      <div>
        <h3 className="text-lg font-semibold text-on-surface mb-4">Import To</h3>
        <div className="flex gap-4">
          <button
            onClick={() => setTargetLibrary(LIBRARY_PRODUCTION)}
            disabled={!isOwnerOrAdmin}
            className={`flex-1 p-4 rounded-[12px] border-2 transition-all ${
              !isOwnerOrAdmin ? 'opacity-50 cursor-not-allowed' :
              targetLibrary === LIBRARY_PRODUCTION
                ? ''
                : 'border-outline-variant/30 hover:border-outline-variant/50'
            }`}
            style={targetLibrary === LIBRARY_PRODUCTION ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}15` } : {}}
          >
            <div className="flex items-center gap-3">
              <Icon
                name="shield"
                className="w-5 h-5"
                style={{ color: targetLibrary === LIBRARY_PRODUCTION ? BRAND_COLOR : undefined }}
              />
              <div className="text-left">
                <p className="font-medium text-on-surface">{LIBRARY_LABELS[LIBRARY_PRODUCTION]} {!isOwnerOrAdmin && <span className="text-xs text-on-surface-variant">(Admin only)</span>}</p>
                <p className="text-xs text-on-surface-variant">Curated rules for SIEM deployment</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setTargetLibrary(LIBRARY_DEVELOPMENT)}
            className={`flex-1 p-4 rounded-[12px] border-2 transition-all ${
              targetLibrary === LIBRARY_DEVELOPMENT
                ? 'border-tertiary bg-tertiary-container/20'
                : 'border-outline-variant/30 hover:border-outline-variant/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon
                name="globe"
                className={`w-5 h-5 ${
                  targetLibrary === LIBRARY_DEVELOPMENT ? 'text-tertiary' : 'text-on-surface-variant'
                }`}
              />
              <div className="text-left">
                <p className="font-medium text-on-surface">{LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}</p>
                <p className="text-xs text-on-surface-variant">Sandbox for vendor rules and experimentation</p>
              </div>
            </div>
          </button>
        </div>

        {/* Production Library warning */}
        {targetLibrary === LIBRARY_PRODUCTION && (
          <div className="mt-3 p-3 bg-tertiary-container/20 border border-tertiary/30 rounded-[12px]">
            <div className="flex items-start gap-2">
              <Icon name="alert-triangle" className="w-4 h-4 text-tertiary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface-variant">
                <span className="font-medium text-tertiary">Organization-wide impact:</span>{' '}
                Rules imported to the Production Library will be visible to all members and are intended for SIEM deployment.
                Only owners and admins can import to this library.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate handling strategy */}
      <div>
        <h3 className="text-lg font-semibold text-on-surface mb-2">Duplicate Handling</h3>
        <p className="text-sm text-on-surface-variant mb-4">
          If a rule with the same ID already exists in the library:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DUPLICATE_OPTIONS.map((option) => {
            const isSelected = duplicateStrategy === option.id;

            return (
              <button
                key={option.id}
                onClick={() => setDuplicateStrategy(option.id)}
                className={`p-4 rounded-[12px] border-2 text-left transition-all ${
                  isSelected
                    ? ''
                    : 'border-outline-variant/30 hover:border-outline-variant/50 hover:bg-surface-container'
                }`}
                style={isSelected ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}15` } : {}}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-full transition-colors ${
                      isSelected
                        ? 'text-white'
                        : 'bg-surface-variant text-on-surface-variant'
                    }`}
                    style={isSelected ? { backgroundColor: BRAND_COLOR } : {}}
                  >
                    <Icon name={option.icon} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium text-sm ${
                        isSelected ? '' : 'text-on-surface'
                      }`}
                      style={isSelected ? { color: BRAND_COLOR } : {}}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-[12px] bg-error-container/30 border border-error/30">
          <div className="flex items-center gap-3">
            <Icon name="alert-circle" className="w-5 h-5 text-error" />
            <p className="text-sm text-error">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleStartImport}
          disabled={!canProceed || isLoading}
          className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
            canProceed && !isLoading
              ? 'text-white hover:opacity-90'
              : 'bg-surface-variant text-on-surface-variant/50 cursor-not-allowed'
          }`}
          style={canProceed && !isLoading ? { backgroundColor: BRAND_COLOR } : {}}
        >
          {isLoading ? (
            <>
              <Icon name="spinner" className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Start Import
              <Icon name="arrowRight" className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
