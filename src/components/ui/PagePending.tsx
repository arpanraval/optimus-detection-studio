import React from 'react';
import { Skeleton } from './Skeleton';
import { LoadingStatus } from './LoadingStatus';

export type LoadingLayout = 'list' | 'board' | 'detail' | 'form' | 'dashboard' | 'matrix';

export function PagePending({
  layout = 'list',
  label = 'Loading…',
  columns,
  className = '',
}: {
  layout?: LoadingLayout;
  label?: string;
  columns?: readonly string[];
  className?: string;
}) {
  const boardColumns = columns ?? ['Backlog', 'Draft', 'Development', 'Review', 'Testing', 'Production'];
  return (
    <section className={`p-6 space-y-5 ${className}`} aria-label={label} data-loading-layout={layout}>
      <LoadingStatus label={label} spinner={false} />
      <div role="region" aria-label="Page content" aria-busy="true">
        <div aria-hidden="true" className="loading-placeholder-group">
          {layout === 'board' ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {boardColumns.map((column) => (
                <div key={column} className="flex-1 min-w-[240px] rounded-2xl bg-surface-container-low p-4 space-y-4">
                  <div className="text-sm font-medium text-on-surface-variant">{column}</div>
                  <Skeleton variant="rounded" height="h-32" />
                  <Skeleton variant="rounded" height="h-32" />
                </div>
              ))}
            </div>
          ) : layout === 'dashboard' || layout === 'matrix' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rounded-2xl bg-surface-container-low p-5 space-y-4">
                  <Skeleton width="w-1/2" />
                  <Skeleton variant="rounded" height={layout === 'matrix' ? 'h-40' : 'h-28'} />
                </div>
              ))}
            </div>
          ) : layout === 'form' || layout === 'detail' ? (
            <div className="max-w-5xl space-y-6">
              <Skeleton width="w-1/3" height="h-6" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} variant="rounded" height={layout === 'form' ? 'h-16' : 'h-32'} />
                ))}
              </div>
              <Skeleton variant="rounded" height="h-40" />
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rounded-xl bg-surface-container-low p-4 space-y-3">
                  <Skeleton width="w-2/3" />
                  <Skeleton width="w-1/3" height="h-3" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
