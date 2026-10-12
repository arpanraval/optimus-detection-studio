import React from 'react';
import { LoadingStatus } from './ui/LoadingStatus';

/** Branded startup only; page requests keep the app shell visible. */
export const AppLoader: React.FC = () => (
  <div className="app-startup">
    <div className="app-startup-bars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
    <span aria-hidden="true">OPTIMUS</span>
    <span className="sr-only">
      <LoadingStatus label="Opening Optimus…" spinner={false} />
    </span>
  </div>
);
