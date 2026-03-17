/**
 * Apply alpha to an accent color string.
 * Handles both CSS variable format: rgb(var(--md-ext-color-blue))
 * and plain hex format: #3B82F6
 */
export function withAlpha(color: string, alpha: number): string {
  const varMatch = color.match(/var\(([^)]+)\)/);
  if (varMatch) {
    return `rgb(var(${varMatch[1]}) / ${alpha})`;
  }
  // Plain hex — convert alpha to 2-digit hex suffix
  const hex = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  return `${color}${hex}`;
}
