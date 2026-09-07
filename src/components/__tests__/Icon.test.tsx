import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon, type IconName } from '../Icon';
import { ICON_NAMES, buildIconMap, getIconNames, isIconName } from '../icons/iconRegistry';

describe('icon registry', () => {
  it('defines each icon name in exactly one category', () => {
    const owner = new Map<string, string>();
    for (const [category, names] of Object.entries(getIconNames())) {
      for (const name of names) {
        expect(owner.get(name), `"${name}" is defined in both ${owner.get(name)} and ${category}`).toBeUndefined();
        owner.set(name, category);
      }
    }
  });

  it('exposes every category key as an IconName', () => {
    const fromCategories = Object.values(getIconNames()).flat().sort();
    expect([...ICON_NAMES].sort()).toEqual(fromCategories);
    expect(Object.keys(buildIconMap()).sort()).toEqual(fromCategories);
  });

  it('isIconName narrows plain strings', () => {
    expect(isIconName('edit')).toBe(true);
    expect(isIconName('edit-2')).toBe(false);
    expect(isIconName('toString')).toBe(false);
  });

  it.each(ICON_NAMES)('renders an <svg> for "%s"', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('Icon with an unknown name', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders a visible placeholder and warns once per name in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknown = 'no-such-icon' as IconName;
    const first = render(<Icon name={unknown} />);
    render(<Icon name={unknown} />);
    const host = first.container.firstElementChild as HTMLElement;
    expect(host.dataset.iconMissing).toBe('no-such-icon');
    expect(host.querySelector('svg')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('no-such-icon');
  });

  it('rejects names that are not in the registry at compile time', () => {
    // @ts-expect-error "edit-2" is not an IconName; the registry has "edit".
    const bad: IconName = 'edit-2';
    expect(isIconName(bad)).toBe(false);
  });
});
