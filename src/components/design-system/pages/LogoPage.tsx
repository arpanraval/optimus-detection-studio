import React from 'react';
import { BrandArtwork } from '@/components/brand/BrandArtwork';
import { DesignSystemPage, Section } from '../shared';

export const LogoPage: React.FC = () => (
  <DesignSystemPage
    title="Logo"
    description="The Optimus point-field identity. A solid plum core anchors the mark, with highlights adapted to each surface."
  >
    <Section
      title="Mark and wordmark"
      description="Orbitron for Optimus; Roboto for Detection Studio, with equal line widths."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {(['dark', 'light'] as const).map((tone) => (
          <div
            key={tone}
            className="flex flex-col items-center gap-8 rounded-2xl border border-outline-variant/20 p-8"
            style={{ backgroundColor: tone === 'dark' ? '#0B0B0D' : '#FAF8F6' }}
          >
            <p className={`text-sm font-medium ${tone === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {tone === 'dark' ? 'Dark surface' : 'Light surface'}
            </p>
            <BrandArtwork className="h-44 w-44" tone={tone} />
            <BrandArtwork variant="wordmark" className="h-20 w-full max-w-80" tone={tone} />
            <BrandArtwork variant="lockup" className="h-28 w-full max-w-80" tone={tone} />
          </div>
        ))}
      </div>
    </Section>
    <Section
      title="Small sizes"
      description="Use the standalone mark in navigation and the simplified core for the favicon."
    >
      <div className="flex items-center gap-8 rounded-2xl bg-surface-container p-6">
        <BrandArtwork className="h-14 w-14" />
        <BrandArtwork className="h-11 w-11" />
        <img src="/brand/point-field/favicon.svg" width="24" height="24" alt="Optimus favicon at 24 pixels" />
        <img src="/brand/point-field/favicon.svg" width="16" height="16" alt="Optimus favicon at 16 pixels" />
      </div>
    </Section>
  </DesignSystemPage>
);
