import React from 'react';
import { DesignSystemPage, Section } from '../shared';
import { LoadingStatus } from '../../ui/LoadingStatus';
import { PagePending } from '../../ui/PagePending';
import { Button } from '../../ui/Button';

export const LoadingPage: React.FC = () => (
  <DesignSystemPage title="Loading states" description="One consistent treatment for each kind of wait.">
    <Section
      title="App startup and browser refresh"
      description="Keep the five magenta bars and OPTIMUS label. This appears only before the app is ready."
    >
      <div className="flex flex-col items-center gap-5 py-12 text-primary" role="status" aria-label="Opening Optimus…">
        <div className="app-startup-bars" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <span aria-hidden="true" className="text-xs">
          OPTIMUS
        </span>
      </div>
    </Section>
    <Section
      title="First page load"
      description="Keep navigation visible. Use the same content outline while page code and initial data arrive."
    >
      <PagePending layout="board" label="Loading detections…" />
      <PagePending layout="list" />
      <PagePending layout="detail" />
    </Section>
    <Section
      title="Refresh and actions"
      description="Keep loaded content and drafts in place. Use real progress for imports and research jobs."
    >
      <div className="flex items-center gap-6">
        <LoadingStatus />
        <Button loading>Saving…</Button>
      </div>
    </Section>
    <Section
      title="Accessibility and recovery"
      description="One status per region. Respect reduced motion. A failed read shows retry, never an empty result or an endless spinner."
    >
      <p className="text-sm text-on-surface-variant">
        Loading shapes use only transform and opacity. Ready content appears immediately.
      </p>
    </Section>
  </DesignSystemPage>
);
