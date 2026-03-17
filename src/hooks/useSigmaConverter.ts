import { useState, useEffect, useCallback, useRef } from 'react';
import { SigmaConverterService } from '../services/sigma';
import type { ConversionResult, WorkerStatus } from '../services/sigma';

export function useSigmaConverter() {
  const serviceRef = useRef<SigmaConverterService | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [status, setStatus] = useState<WorkerStatus>({
    ready: false,
    pyodideReady: false,
    installedBackends: [],
  });
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new SigmaConverterService();
    
    const cleanupReady = serviceRef.current.onReady(setIsReady);
    const cleanupStatus = serviceRef.current.onStatusChange(setStatus);
    
    return () => {
      cleanupReady();
      cleanupStatus();
      serviceRef.current?.dispose();
      serviceRef.current = null;
    };
  }, []);

  // Convert function
  const convert = useCallback(async (
    rule: string,
    target: string,
    options?: {
      pipelineYmls?: string[];
      filterYml?: string;
      format?: string;
      backendOptions?: Record<string, any>;
    }
  ) => {
    if (!serviceRef.current) return;
    
    setIsConverting(true);
    setError(null);
    
    try {
      const conversionResult = await serviceRef.current.convert(rule, target, options);
      setResult(conversionResult);
      
      if (conversionResult.error) {
        setError(conversionResult.error);
      }
      
      return conversionResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Conversion failed';
      setError(errorMsg);
      return { query: '', error: errorMsg };
    } finally {
      setIsConverting(false);
    }
  }, []);

  // Install backend
  const installBackend = useCallback(async (target: string) => {
    if (!serviceRef.current) return { success: false, error: 'Service not initialized' };
    return serviceRef.current.installBackend(target);
  }, []);

  return {
    isReady,
    isConverting,
    status,
    result,
    error,
    convert,
    installBackend,
  };
}