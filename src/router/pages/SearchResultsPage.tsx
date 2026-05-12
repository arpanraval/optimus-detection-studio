import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { SearchResults } from '../../components/SearchResults';
import { ROUTES } from '../routes';

export const SearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  return (
    <PageErrorBoundary pageName="Search Results" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <SearchResults query={query} />
    </PageErrorBoundary>
  );
};

export default SearchResultsPage;
