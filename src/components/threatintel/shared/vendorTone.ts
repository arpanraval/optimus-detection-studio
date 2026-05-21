import type { VendorTone } from './types';

// Five-bucket palette tuned for legibility on both light and dark surface tints.
// Deterministic hash → palette index so the same vendor name always gets the
// same tone across surfaces (chips on TTPs, IoCs, MITRE rows, etc.).
const palette: ReadonlyArray<VendorTone> = [
  { bg: 'bg-sky-500/10',     text: 'text-sky-700 dark:text-sky-300',         border: 'border-sky-500/25',    dot: 'bg-sky-500' },
  { bg: 'bg-purple-500/10',  text: 'text-purple-700 dark:text-purple-300',   border: 'border-purple-500/25', dot: 'bg-purple-500' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/25', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500/10',   text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-500/25',  dot: 'bg-amber-500' },
  { bg: 'bg-rose-500/10',    text: 'text-rose-700 dark:text-rose-300',       border: 'border-rose-500/25',   dot: 'bg-rose-500' },
];

export function vendorTone(name: string): VendorTone {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
