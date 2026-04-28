import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ModelSelector } from '../ModelSelector';
import { DEFAULT_MODEL } from '../../lib/aiService';

interface RetryWithModelButtonProps {
  isRetrying: boolean;
  isThisRetrying: boolean;
  onRetry: (model?: string) => void;
  label?: string;
}

export const RetryWithModelButton: React.FC<RetryWithModelButtonProps> = ({
  isRetrying,
  isThisRetrying,
  onRetry,
  label = 'Retry Extraction',
}) => {
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  return (
    <div className="inline-flex items-center gap-3">
      <Button
        variant="outlined"
        color="primary"
        size="sm"
        leadingIcon={isThisRetrying ? 'spinner' : 'refresh-cw'}
        onClick={() => onRetry(model)}
        disabled={isRetrying}
        loading={isThisRetrying}
      >
        {isThisRetrying ? 'Retrying...' : label}
      </Button>
      <ModelSelector
        selectedModelId={model}
        onModelChange={setModel}
        requireCapabilities={{ json: true }}
      />
    </div>
  );
};
