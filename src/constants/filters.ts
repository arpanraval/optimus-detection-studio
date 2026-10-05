/**
 * Shared constants for the "(None)" / missing-value filter option.
 *
 * Several library filter groups can be inverted to ask "which rules have nothing here?".
 * That question is what the Dashboard hygiene widgets link into, and until now it was only
 * reachable through the `?missingField=` URL param. The sentinel below lets the same question
 * be asked from the filter panel: it travels as a normal filter value, and the server-side
 * query builder turns it into an `is null OR is empty` check on the mapped column.
 *
 * The sentinel is exclusive within its group — picking "(None)" clears the concrete values and
 * vice versa. "No tactics OR Defense Evasion" is not a question anyone asks, and keeping the two
 * apart means user-supplied values are never interpolated into a PostgREST `or()` string.
 */

/** Filter value that means "this field is empty". Cannot collide with a real value. */
export const EMPTY_FILTER_VALUE = '__EMPTY__';

/** Label shown for {@link EMPTY_FILTER_VALUE} in the filter panel and active-filter chips. */
export const EMPTY_FILTER_LABEL = '(None)';

export interface EmptyCheckTarget {
  /** DB column the emptiness check runs against. */
  column: string;
  /** Array columns compare against `{}`; scalar columns against an empty string. */
  kind: 'array' | 'scalar';
}

/**
 * Filter fields that support "(None)", and the column each one tests.
 *
 * Note `logSource`: the filter group lists values from the legacy scalar `logSource`, but
 * emptiness is tested against the canonical `logSources` array so the count matches the
 * Dashboard "Missing Log Sources" widget, which is where users meet this question first.
 */
export const EMPTY_FILTER_TARGETS: Record<string, EmptyCheckTarget> = {
  mitreTactics: { column: 'mitreTactics', kind: 'array' },
  mitreTechniques: { column: 'mitreTechniques', kind: 'array' },
  platforms: { column: 'platforms', kind: 'array' },
  tags: { column: 'tags', kind: 'array' },
  threatActors: { column: 'threatActors', kind: 'array' },
  campaigns: { column: 'campaigns', kind: 'array' },
  software: { column: 'software', kind: 'array' },
  associatedCVEs: { column: 'associatedCVEs', kind: 'array' },
  logSource: { column: 'logSources', kind: 'array' },
  technology: { column: 'technology', kind: 'scalar' },
  queryLanguage: { column: 'queryLanguage', kind: 'scalar' },
  author: { column: 'author', kind: 'scalar' },
};

/** Whether a filter field offers the "(None)" option. */
export const supportsEmptyFilter = (field: string): boolean =>
  Object.prototype.hasOwnProperty.call(EMPTY_FILTER_TARGETS, field);

/** Whether a selection for a field is the "(None)" option rather than concrete values. */
export const isEmptyFilterSelection = (values: string[] | undefined): boolean =>
  !!values && values.includes(EMPTY_FILTER_VALUE);

/**
 * Reverse lookup for the legacy `?missingField=<column>` URL param, so a link from the
 * Dashboard lands on a filter the user can see and clear in the panel.
 * Returns the filter field that tests the given column, if any.
 */
export const filterFieldForMissingColumn = (column: string): string | undefined =>
  Object.keys(EMPTY_FILTER_TARGETS).find(field => EMPTY_FILTER_TARGETS[field].column === column);
