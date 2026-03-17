import React from 'react';
import { Link } from 'react-router-dom';

interface LinkCardProps {
  to: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A thin wrapper around react-router-dom <Link> that renders as a block element.
 * Strips default anchor styles (underline, color) so it behaves like a div.
 * Supports Ctrl+Click, middle-click, and right-click "Open in New Tab" natively.
 */
export const LinkCard: React.FC<LinkCardProps> = ({ to, className = '', children }) => {
  return (
    <Link
      to={to}
      className={`block no-underline text-inherit ${className}`}
    >
      {children}
    </Link>
  );
};
