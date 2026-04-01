
import React from 'react';
import { Icon } from './Icon';

interface AddDetectionSelectionProps {
  onManualCreate: () => void;
  onImportFromFile: () => void;
  onImportFromZip: () => void;
  onImportFromGitHub: () => void;
}

// Consistent brand color for all import icons
const BRAND_COLOR = '#783264';

export const AddDetectionSelection: React.FC<AddDetectionSelectionProps> = ({
  onManualCreate,
  onImportFromFile,
  onImportFromZip,
  onImportFromGitHub,
}) => {
  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10 h-full flex flex-col items-center justify-start pt-[20vh]">
       <div className="text-center mb-16 animate-fade-in">
         <h1 className="text-4xl font-brand font-bold text-on-surface mb-4">Add Detection</h1>
         <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">Choose how you want to add new detection rules to your library.</p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          {/* Card 1: Create Manually */}
          <button
            type="button"
            onClick={onManualCreate}
            className="bg-surface-container-low border border-outline-variant/30 rounded-[24px] p-6 flex flex-col items-center text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:border-[#783264]/50 hover:bg-surface-container group animate-slide-up"
            style={{ animationDelay: '100ms' }}
          >
             <div
               className="p-5 rounded-full mb-5 transition-colors"
               style={{ backgroundColor: `${BRAND_COLOR}20` }}
             >
                <Icon name="plus" className="w-9 h-9" style={{ color: BRAND_COLOR }} aria-hidden="true" />
             </div>
             <h2 className="text-lg font-bold text-on-surface mb-2 group-hover:text-[#783264] transition-colors">Create Detection</h2>
             <p className="text-sm text-on-surface-variant leading-relaxed">
                Author new rules from scratch with AI assistance.
             </p>
          </button>

          {/* Card 2: Import from Files */}
          <button
            type="button"
            onClick={onImportFromFile}
            className="bg-surface-container-low border border-outline-variant/30 rounded-[24px] p-6 flex flex-col items-center text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:border-[#783264]/50 hover:bg-surface-container group animate-slide-up"
            style={{ animationDelay: '150ms' }}
          >
             <div
               className="p-5 rounded-full mb-5 transition-colors"
               style={{ backgroundColor: `${BRAND_COLOR}20` }}
             >
                <Icon name="file-code" className="w-9 h-9" style={{ color: BRAND_COLOR }} aria-hidden="true" />
             </div>
             <h2 className="text-lg font-bold text-on-surface mb-2 group-hover:text-[#783264] transition-colors">Import from Files</h2>
             <p className="text-sm text-on-surface-variant leading-relaxed">
                Upload individual YAML or rule files.
             </p>
          </button>

          {/* Card 3: Import from ZIP */}
          <button
            type="button"
            onClick={onImportFromZip}
            className="bg-surface-container-low border border-outline-variant/30 rounded-[24px] p-6 flex flex-col items-center text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:border-[#783264]/50 hover:bg-surface-container group animate-slide-up"
            style={{ animationDelay: '200ms' }}
          >
             <div
               className="p-5 rounded-full mb-5 transition-colors"
               style={{ backgroundColor: `${BRAND_COLOR}20` }}
             >
                <Icon name="archive" className="w-9 h-9" style={{ color: BRAND_COLOR }} aria-hidden="true" />
             </div>
             <h2 className="text-lg font-bold text-on-surface mb-2 group-hover:text-[#783264] transition-colors">Import from ZIP</h2>
             <p className="text-sm text-on-surface-variant leading-relaxed">
                Bulk import from ZIP archives.
             </p>
          </button>

          {/* Card 4: Import from GitHub */}
          <button
            type="button"
            onClick={onImportFromGitHub}
            className="bg-surface-container-low border border-outline-variant/30 rounded-[24px] p-6 flex flex-col items-center text-center cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:border-[#783264]/50 hover:bg-surface-container group animate-slide-up"
            style={{ animationDelay: '250ms' }}
          >
             <div
               className="p-5 rounded-full mb-5 transition-colors"
               style={{ backgroundColor: `${BRAND_COLOR}20` }}
             >
                <Icon name="github" className="w-9 h-9" style={{ color: BRAND_COLOR }} aria-hidden="true" />
             </div>
             <h2 className="text-lg font-bold text-on-surface mb-2 group-hover:text-[#783264] transition-colors">Import from GitHub</h2>
             <p className="text-sm text-on-surface-variant leading-relaxed">
                Connect to SigmaHQ or other repos.
             </p>
          </button>
       </div>
    </div>
  );
};
