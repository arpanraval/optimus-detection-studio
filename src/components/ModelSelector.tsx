import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { LLM_MODELS, LLMModel, LLMProvider, getModelById } from '../lib/aiService';
import type { IconName } from './Icon';

// =============================================================================
// TYPES
// =============================================================================

interface ModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  /** Filter to only show models with specific capabilities */
  requireCapabilities?: {
    tools?: boolean;
    json?: boolean;
  };
  /** Compact mode shows just the model name badge */
  compact?: boolean;
  className?: string;
}

// Provider icons and colors
const PROVIDER_CONFIG: Record<LLMProvider, { icon: IconName; color: string; name: string }> = {
  google: { icon: 'spark', color: 'text-blue-400', name: 'Google' },
  openai: { icon: 'brain', color: 'text-green-400', name: 'OpenAI' },
  anthropic: { icon: 'cpu', color: 'text-orange-400', name: 'Anthropic' }
};

// =============================================================================
// COMPONENT
// =============================================================================

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  onModelChange,
  requireCapabilities,
  compact = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter models based on required capabilities
  const availableModels = LLM_MODELS.filter(model => {
    if (requireCapabilities?.tools && !model.capabilities.tools) return false;
    if (requireCapabilities?.json && !model.capabilities.json) return false;
    return true;
  });

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<LLMProvider, LLMModel[]>);

  const selectedModel = getModelById(selectedModelId) || availableModels[0];
  const providerConfig = PROVIDER_CONFIG[selectedModel?.provider || 'google'];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (compact) {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono text-tertiary/80 bg-tertiary/10 rounded hover:bg-tertiary/20 transition-colors"
        >
          <Icon name={providerConfig.icon} className={`w-2.5 h-2.5 ${providerConfig.color}`} />
          {selectedModel?.name}
          <Icon name="chevron-down" className="w-2.5 h-2.5 text-tertiary/50" />
        </button>

        {isOpen && (
          <ModelDropdown
            modelsByProvider={modelsByProvider}
            selectedModelId={selectedModelId}
            onSelect={(id) => {
              onModelChange(id);
              setIsOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <Icon name={providerConfig.icon} className={`w-3.5 h-3.5 ${providerConfig.color}`} />
        {selectedModel?.name}
        <Icon name="chevron-down" className="w-3 h-3 text-on-surface-variant/50" />
      </button>

      {isOpen && (
        <ModelDropdown
          modelsByProvider={modelsByProvider}
          selectedModelId={selectedModelId}
          onSelect={(id) => {
            onModelChange(id);
            setIsOpen(false);
          }}
        />
      )}
    </div>
  );
};

// =============================================================================
// DROPDOWN COMPONENT
// =============================================================================

interface ModelDropdownProps {
  modelsByProvider: Record<LLMProvider, LLMModel[]>;
  selectedModelId: string;
  onSelect: (modelId: string) => void;
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  modelsByProvider,
  selectedModelId,
  onSelect
}) => {
  const providers: LLMProvider[] = ['google', 'openai', 'anthropic'];

  return (
    <div className="absolute right-0 top-full mt-1 w-64 bg-surface-container-highest/95 backdrop-blur-xl rounded-xl border border-outline-variant/10 shadow-2xl z-50 overflow-hidden">
      <div className="py-1 max-h-80 overflow-y-auto ai-scroll">
        {providers.map(provider => {
          const models = modelsByProvider[provider];
          if (!models || models.length === 0) return null;

          const config = PROVIDER_CONFIG[provider];

          return (
            <div key={provider}>
              {/* Provider Header */}
              <div className="px-3 py-2 flex items-center gap-2 border-b border-outline-variant/10 bg-surface-container-low/50">
                <Icon name={config.icon} className={`w-3.5 h-3.5 ${config.color}`} />
                <span className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider">
                  {config.name}
                </span>
              </div>

              {/* Models */}
              {models.map(model => (
                <button
                  key={model.id}
                  onClick={() => onSelect(model.id)}
                  className={`w-full text-left px-4 py-2.5 transition-colors ${
                    selectedModelId === model.id
                      ? 'text-on-surface bg-surface-container-high/50'
                      : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/30'
                  }`}
                >
                  <div className="text-xs font-medium">{model.name}</div>
                  <div className="text-[10px] text-on-surface-variant/50 mt-0.5">{model.description}</div>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-outline-variant/10 bg-surface-container-low/30">
        <p className="text-[9px] text-on-surface-variant/40 text-center">
          Model selection requires API keys configured in Supabase
        </p>
      </div>
    </div>
  );
};

export default ModelSelector;
