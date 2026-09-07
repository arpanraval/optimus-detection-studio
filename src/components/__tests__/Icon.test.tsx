import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon';
import { buildIconMap, getIconNames } from '../icons/iconRegistry';

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

  it.each(Object.keys(buildIconMap()))('renders an <svg> for "%s"', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
