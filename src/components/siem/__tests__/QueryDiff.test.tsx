import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryDiff, diffQueryLines } from '../QueryDiff';

describe('diffQueryLines', () => {
  it('marks nothing when the two queries are identical', () => {
    const query = '#Vendor="okta"\n| #event.outcome="success"';
    const diff = diffQueryLines(query, query);
    expect(diff.local.every((line) => line.kind === 'same')).toBe(true);
    expect(diff.remote.every((line) => line.kind === 'same')).toBe(true);
  });

  // CRLF vs LF is not a change the user made. An imported rule carries CRLF from the vendor, so
  // treating it as a difference would mark every single line as changed and bury the real one.
  it('does not treat a line-ending difference as a change', () => {
    const diff = diffQueryLines('a\nb\nc', 'a\r\nb\r\nc');
    expect(diff.local.every((line) => line.kind === 'same')).toBe(true);
  });

  // The real case from production: the library copy is missing `#repo!="xdr*"` on line 1, so
  // pressing Update would strip that scope filter off a live detection.
  it('marks a line present only in production as one the update would remove', () => {
    const local = '#Vendor="okta" #event.module="sso"\n| #event.outcome="success"';
    const remote = '#Vendor="okta" #event.module="sso" #repo!="xdr*"\n| #event.outcome="success"';
    const diff = diffQueryLines(local, remote);
    expect(diff.remote.filter((line) => line.kind === 'removed').map((line) => line.text))
      .toEqual(['#Vendor="okta" #event.module="sso" #repo!="xdr*"']);
    expect(diff.local.filter((line) => line.kind === 'added').map((line) => line.text))
      .toEqual(['#Vendor="okta" #event.module="sso"']);
    // The shared line stays unmarked on both sides, so the eye goes to the change.
    expect(diff.local.filter((line) => line.kind === 'same')).toHaveLength(1);
  });

  it('marks a line present only in the library as one the update would add', () => {
    const diff = diffQueryLines('keep\nbrand new', 'keep');
    expect(diff.local.filter((line) => line.kind === 'added').map((line) => line.text)).toEqual(['brand new']);
    expect(diff.remote.filter((line) => line.kind === 'removed')).toHaveLength(0);
  });

  it('keeps unchanged lines around an edit unmarked', () => {
    const diff = diffQueryLines('a\nCHANGED\nc', 'a\noriginal\nc');
    expect(diff.local.map((line) => line.kind)).toEqual(['same', 'added', 'same']);
    expect(diff.remote.map((line) => line.kind)).toEqual(['same', 'removed', 'same']);
  });
});

describe('QueryDiff', () => {
  it('states in plain words what the update would do to the remote rule', () => {
    render(
      <QueryDiff
        local={'#Vendor="okta" #event.module="sso"\n| #event.outcome="success"'}
        remote={'#Vendor="okta" #event.module="sso" #repo!="xdr*"\n| #event.outcome="success"'}
        remoteTitle="CrowdStrike Falcon Production"
      />,
    );
    expect(screen.getByRole('status').textContent)
      .toBe('Updating would add 1 line to and remove 1 line from the rule in CrowdStrike Falcon Production.');
  });

  it('says so when nothing differs, rather than leaving the reader to compare', () => {
    const query = '#Vendor="okta"';
    render(<QueryDiff local={query} remote={query} remoteTitle="CrowdStrike Falcon Production" />);
    expect(screen.getByRole('status').textContent).toBe('The query is identical in both places.');
  });

  // Colour alone must never be the only signal.
  it('marks changed lines with a +/- character as well as colour', () => {
    const { container } = render(
      <QueryDiff local={'keep\nonly here'} remote={'keep'} remoteTitle="CrowdStrike" />,
    );
    const markers = [...container.querySelectorAll('span[aria-hidden="true"]')].map((el) => el.textContent);
    expect(markers).toContain('+');
  });
});
