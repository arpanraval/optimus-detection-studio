import React from 'react';
import { Modal } from '../ui/Modal';
import { SiemPreflightPanel } from './SiemPreflightPanel';
import type { Detection } from '../../types';

interface SiemPreflightModalProps {
  detection: Detection;
  onClose: () => void;
}

export const SiemPreflightModal: React.FC<SiemPreflightModalProps> = ({ detection, onClose }) => (
  <Modal title="Test in SIEM" subject={{ label: 'Detection', value: detection.name }} onClose={onClose}>
    <SiemPreflightPanel detection={detection} mode="standalone" />
  </Modal>
);
