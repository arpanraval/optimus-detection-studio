import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../Icon';
import { PACK_EXPORT_FORMATS } from './PackExportMenu';
import { downloadExport, exportPackAs, type ExportFormat } from '../../lib/exporters/packExporters';
import { useToast } from '../../hooks/useToast';
import type { Detection, DetectionPack } from '../../types';

export interface PackAction {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}
interface Props {
  pack: DetectionPack & { detections?: Detection[] };
  actions: PackAction[];
}

export function PackActionsMenu({ pack, actions }: Props) {
  const [open, setOpen] = useState(false);
  const [exportPage, setExportPage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { showToast } = useToast();
  const focusTrigger = () => anchor.current?.querySelector('button')?.focus();
  const close = () => {
    setOpen(false);
    setExportPage(false);
    focusTrigger();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const bounds = anchor.current?.getBoundingClientRect();
      if (bounds) setPosition({ top: bounds.bottom + 8, right: Math.max(8, window.innerWidth - bounds.right) });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) {
        setOpen(false);
        setExportPage(false);
      }
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open, exportPage]);

  const exportPack = async (format: ExportFormat) => {
    close();
    setExporting(true);
    try {
      const result = await exportPackAs(pack, format);
      downloadExport(result);
      showToast('success', 'Pack Exported', `Downloaded ${result.filename}`);
    } catch (error) {
      showToast('error', 'Export Failed', error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };
  const itemClass =
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left text-on-surface hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  const renderAction = (action: PackAction) => (
    <button
      key={action.label}
      role="menuitem"
      type="button"
      disabled={action.disabled}
      onClick={() => {
        close();
        action.onClick();
      }}
      className={`${itemClass} ${action.destructive ? 'text-error' : ''}`}
    >
      <Icon name={action.icon} className="w-4 h-4 shrink-0" />
      {action.label}
    </button>
  );
  return (
    <div ref={anchor} className="shrink-0">
      <Button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen(!open);
          setExportPage(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        loading={exporting}
        trailingIcon="chevron-down"
      >
        Actions
      </Button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={exportPage ? 'Export formats' : 'Pack actions'}
            style={{ position: 'fixed', ...position, zIndex: 1000, maxHeight: `calc(100vh - ${position.top + 8}px)` }}
            className="w-60 max-w-[calc(100vw-1rem)] overflow-auto p-1.5 rounded-xl bg-surface-container border border-outline-variant/60 shadow-lg"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
              if (event.key === 'Tab') {
                setOpen(false);
                setExportPage(false);
              }
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const items = [
                  ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
                ];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items[next]?.focus();
              }
            }}
          >
            {exportPage ? (
              <>
                <button role="menuitem" className={itemClass} onClick={() => setExportPage(false)}>
                  <Icon name="arrow-left" className="w-4 h-4" />
                  Back to actions
                </button>
                <div role="separator" className="my-1 border-t border-outline-variant/60" />
                {PACK_EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    role="menuitem"
                    className={itemClass}
                    title={format.tooltip}
                    onClick={() => void exportPack(format.value)}
                  >
                    <Icon name={format.icon} className="w-4 h-4" />
                    {format.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                {actions.filter((action) => !action.destructive).map(renderAction)}
                <button role="menuitem" className={itemClass} onClick={() => setExportPage(true)}>
                  <Icon name="download" className="w-4 h-4" />
                  Export
                  <Icon name="chevron-right" className="w-4 h-4 ml-auto" />
                </button>
                {actions.some((action) => action.destructive) && (
                  <div role="separator" className="my-1 border-t border-outline-variant/60" />
                )}
                {actions.filter((action) => action.destructive).map(renderAction)}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
