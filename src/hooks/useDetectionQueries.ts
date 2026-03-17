
import { useState, useCallback } from 'react';
import { DetectionQuery } from '../types';

interface UseDetectionQueriesResult {
  queries: DetectionQuery[];
  activeQueryId: string | null;
  activeQuery: DetectionQuery | null;
  addQuery: (language: string) => void;
  updateQuery: (id: string, updates: Partial<DetectionQuery>) => void;
  deleteQuery: (id: string) => void;
  setActiveQuery: (id: string) => void;
  setPrimaryQuery: (id: string) => void;
  setQueries: (queries: DetectionQuery[]) => void;
  getPrimaryQuery: () => DetectionQuery | null;
}

export function useDetectionQueries(
  initialQueries: DetectionQuery[] = []
): UseDetectionQueriesResult {
  const [queries, setQueries] = useState<DetectionQuery[]>(initialQueries);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(
    initialQueries.length > 0 ? initialQueries[0].id : null
  );

  const activeQuery = queries.find(q => q.id === activeQueryId) || null;

  const addQuery = useCallback((language: string) => {
    const newQuery: DetectionQuery = {
      id: crypto.randomUUID(),
      language,
      query: '',
      explanation: '',
      isPrimary: queries.length === 0, // First query is primary
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };
    
    setQueries(prev => [...prev, newQuery]);
    setActiveQueryId(newQuery.id);
  }, [queries.length]);

  const updateQuery = useCallback((id: string, updates: Partial<DetectionQuery>) => {
    setQueries(prev => prev.map(q => 
      q.id === id 
        ? { ...q, ...updates, updatedDate: new Date().toISOString() }
        : q
    ));
  }, []);

  const deleteQuery = useCallback((id: string) => {
    setQueries(prev => {
      const filtered = prev.filter(q => q.id !== id);
      
      // If we deleted the primary, make the first one primary
      if (filtered.length > 0 && !filtered.some(q => q.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      
      return filtered;
    });
    
    // Switch to another query if we deleted the active one
    if (activeQueryId === id) {
      setActiveQueryId(queries.find(q => q.id !== id)?.id || null);
    }
  }, [activeQueryId, queries]);

  const setPrimaryQuery = useCallback((id: string) => {
    setQueries(prev => prev.map(q => ({
      ...q,
      isPrimary: q.id === id
    })));
  }, []);

  const getPrimaryQuery = useCallback(() => {
    return queries.find(q => q.isPrimary) || queries[0] || null;
  }, [queries]);

  return {
    queries,
    activeQueryId,
    activeQuery,
    addQuery,
    updateQuery,
    deleteQuery,
    setActiveQuery: setActiveQueryId,
    setPrimaryQuery,
    setQueries,
    getPrimaryQuery
  };
}
