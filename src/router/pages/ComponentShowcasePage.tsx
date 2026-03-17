import React from 'react';
import { ComponentShowcase } from '../../components/design-system/ComponentShowcase';

interface ComponentShowcasePageProps {
    tab?: string;
}

export const ComponentShowcasePage: React.FC<ComponentShowcasePageProps> = ({ tab }) => {
    return <ComponentShowcase initialTab={tab} />;
};
