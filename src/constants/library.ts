// Library types (DB values)
export const LIBRARY_DEVELOPMENT = 'development' as const;
export const LIBRARY_PRODUCTION = 'production' as const;
export type LibraryType = typeof LIBRARY_DEVELOPMENT | typeof LIBRARY_PRODUCTION;

// Visibility (DB values)
export const VISIBILITY_PRIVATE = 'private' as const;
export const VISIBILITY_SHARED = 'shared' as const;
export type Visibility = typeof VISIBILITY_PRIVATE | typeof VISIBILITY_SHARED;

// Promotion status (DB values)
export const PROMOTION_NONE = 'none' as const;
export const PROMOTION_PENDING = 'pending' as const;
export const PROMOTION_PROMOTED = 'promoted' as const;
export const PROMOTION_REJECTED = 'rejected' as const;
export type PromotionStatus = typeof PROMOTION_NONE | typeof PROMOTION_PENDING | typeof PROMOTION_PROMOTED | typeof PROMOTION_REJECTED;

// UI Labels
export const LIBRARY_LABELS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Development Library',
  [LIBRARY_PRODUCTION]: 'Production Library',
};

export const LIBRARY_LABELS_SHORT: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Development',
  [LIBRARY_PRODUCTION]: 'Production',
};

export const LIBRARY_ICONS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'flask',
  [LIBRARY_PRODUCTION]: 'shield',
};

export const LIBRARY_DESCRIPTIONS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Draft area for experiments, imports, and collaboration',
  [LIBRARY_PRODUCTION]: 'Curated, deploy-ready detections',
};

export const PROMOTION_LABELS: Record<PromotionStatus, string> = {
  [PROMOTION_NONE]: '',
  [PROMOTION_PENDING]: 'Pending Promotion',
  [PROMOTION_PROMOTED]: 'Promoted',
  [PROMOTION_REJECTED]: 'Promotion Rejected',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  [VISIBILITY_PRIVATE]: 'Private',
  [VISIBILITY_SHARED]: 'Shared',
};
