import React, { useRef, useState, forwardRef } from 'react';
import { Icon } from '../Icon';

export type FileUploadSize = 'sm' | 'md' | 'lg';
export type FileUploadState = 'default' | 'error' | 'success';

export interface FileUploadProps {
  /** Upload area size variant */
  size?: FileUploadSize;
  /** Upload validation state */
  state?: FileUploadState;
  /** Accepted file types (e.g., "image/*,.pdf") */
  accept?: string;
  /** Allow multiple files */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  errorMessage?: string;
  /** Success message */
  successMessage?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode (button only, no drop zone) */
  compact?: boolean;
  /** Callback when files are selected */
  onFilesSelect?: (files: File[]) => void;
  /** Callback when file is rejected */
  onFileReject?: (reason: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * FileUpload Component with Detection Studio Color System
 *
 * Colors:
 * - Primary/Focus: #783264 (Magenta)
 * - Success: #4D7C6F (Sage Green)
 * - Error: #A63D40 (Brick Red)
 *
 * Variants:
 * - Default: Full drop zone with drag & drop
 * - Compact: Button only for file selection
 *
 * @example
 * // Basic file upload
 * <FileUpload
 *   label="Upload files"
 *   helperText="PNG, JPG or PDF up to 10MB"
 *   onFilesSelect={(files) => console.log(files)}
 * />
 *
 * // Compact button mode
 * <FileUpload compact accept="image/*" />
 *
 * // With validation
 * <FileUpload
 *   accept=".pdf"
 *   maxSize={5 * 1024 * 1024}
 *   state="error"
 *   errorMessage="File too large"
 * />
 */
export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(({
  size = 'md',
  state = 'default',
  accept,
  multiple = false,
  maxSize,
  label,
  helperText,
  errorMessage,
  successMessage,
  disabled = false,
  compact = false,
  onFilesSelect,
  onFileReject,
  className = '',
}, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Combine refs
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  // Size styles
  const sizeStyles: Record<FileUploadSize, { padding: string; text: string; icon: number }> = {
    sm: { padding: 'p-4', text: 'text-xs', icon: 24 },
    md: { padding: 'p-6', text: 'text-sm', icon: 32 },
    lg: { padding: 'p-8', text: 'text-base', icon: 40 },
  };

  // State styles
  const stateStyles: Record<FileUploadState, { border: string; text: string }> = {
    default: { border: 'border-outline-variant/30', text: 'text-on-surface-variant/60' },
    error: { border: 'border-[#A63D40]', text: 'text-[#A63D40]' },
    success: { border: 'border-[#4D7C6F]', text: 'text-[#4D7C6F]' },
  };

  const currentSize = sizeStyles[size];
  const currentState = stateStyles[state];

  // Magic byte signatures for content-based file type validation
  const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
    'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
    'image/png': [{ bytes: [0x89, 0x50, 0x4E, 0x47] }],
    'image/jpeg': [{ bytes: [0xFF, 0xD8, 0xFF] }],
    'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
    'application/zip': [{ bytes: [0x50, 0x4B, 0x03, 0x04] }], // PK..
    'application/gzip': [{ bytes: [0x1F, 0x8B] }],
  };

  /** Check file content against known magic byte signatures */
  const validateMagicBytes = async (file: File): Promise<boolean> => {
    // Only validate binary types that have known signatures
    const matchableTypes = Object.keys(MAGIC_BYTES);
    const fileType = file.type;
    if (!fileType || !matchableTypes.includes(fileType)) return true; // Skip text-based formats (yaml, json, csv)

    try {
      const slice = file.slice(0, 8);
      const buffer = await slice.arrayBuffer();
      const header = new Uint8Array(buffer);

      const signatures = MAGIC_BYTES[fileType];
      if (!signatures) return true;

      return signatures.some(sig => {
        const offset = sig.offset ?? 0;
        return sig.bytes.every((byte, i) => header[offset + i] === byte);
      });
    } catch {
      return true; // If we can't read, allow and let server validate
    }
  };

  // Handle file validation
  const validateFiles = async (files: File[]): Promise<File[]> => {
    const validFiles: File[] = [];

    for (const file of files) {
      // Check max size
      if (maxSize && file.size > maxSize) {
        onFileReject?.(`File "${file.name}" exceeds maximum size`);
        continue;
      }

      // Check file type (extension + MIME)
      if (accept) {
        const acceptedTypes = accept.split(',').map(t => t.trim());
        const fileType = file.type;
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExtension === type.toLowerCase();
          }
          if (type.endsWith('/*')) {
            return fileType.startsWith(type.replace('/*', '/'));
          }
          return fileType === type;
        });

        if (!isAccepted) {
          onFileReject?.(`File "${file.name}" type not accepted`);
          continue;
        }
      }

      // Validate magic bytes for binary files to prevent disguised uploads
      const magicValid = await validateMagicBytes(file);
      if (!magicValid) {
        onFileReject?.(`File "${file.name}" content does not match its declared type`);
        continue;
      }

      validFiles.push(file);
    }

    return validFiles;
  };

  // Handle file selection
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles = await validateFiles(fileArray);

    if (validFiles.length > 0) {
      setSelectedFiles(multiple ? [...selectedFiles, ...validFiles] : validFiles);
      onFilesSelect?.(validFiles);
    }
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle click to open file dialog
  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  // Remove file
  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
  };

  // Get displayed message
  const displayedMessage = state === 'error' ? errorMessage : state === 'success' ? successMessage : helperText;

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Hidden input
  const FileInput = () => (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      onChange={handleChange}
      disabled={disabled}
      className="sr-only"
    />
  );

  // Compact mode - button only
  if (compact) {
    return (
      <div className={className}>
        <FileInput />
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={[
            'inline-flex items-center gap-2',
            'px-4 py-2 rounded-xl',
            'bg-[#783264] text-white',
            'hover:bg-[#783264]/90',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#783264]/50',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            currentSize.text,
          ].filter(Boolean).join(' ')}
        >
          <Icon name="upload" size={16} />
          <span>Choose File{multiple ? 's' : ''}</span>
        </button>

        {selectedFiles.length > 0 && (
          <span className="ml-3 text-sm text-on-surface-variant">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>
    );
  }

  // Full drop zone mode
  return (
    <div className={className}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-on-surface mb-1.5">
          {label}
        </label>
      )}

      {/* Drop zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative rounded-xl border-2 border-dashed',
          currentSize.padding,
          currentState.border,
          isDragOver && 'border-[#783264] bg-[#783264]/5',
          'flex flex-col items-center justify-center text-center',
          'cursor-pointer transition-all',
          disabled && 'opacity-50 cursor-not-allowed bg-surface-container',
        ].filter(Boolean).join(' ')}
      >
        <FileInput />

        <Icon
          name="upload-cloud"
          size={currentSize.icon}
          className={isDragOver ? 'text-[#783264]' : 'text-on-surface-variant/40'}
        />

        <p className={`mt-3 ${currentSize.text} text-on-surface`}>
          <span className="text-[#783264] font-medium">Click to upload</span>
          {' or drag and drop'}
        </p>

        {displayedMessage && (
          <p className={`mt-1 text-xs ${currentState.text}`}>
            {displayedMessage}
          </p>
        )}
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <ul className="mt-3 space-y-2">
          {selectedFiles.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-surface-container rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon name="file-text" className="w-5 h-5 text-on-surface-variant/50 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-on-surface truncate">{file.name}</p>
                  <p className="text-xs text-on-surface-variant/60">{formatSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(index);
                }}
                className="p-1 rounded-full hover:bg-surface-container-highest text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

FileUpload.displayName = 'FileUpload';

export default FileUpload;
