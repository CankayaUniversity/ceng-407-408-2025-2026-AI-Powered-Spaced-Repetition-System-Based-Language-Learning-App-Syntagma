import type { WordStatus } from '../../shared/types';

const C = {
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#E9C46A',
  green: '#A8B693',
  base: '#F5F1E9',
};

const STATUS_CONFIG: Array<{
  status: WordStatus;
  label: string;
  color: string;
  description: string;
}> = [
  { status: 'unknown', label: '?', color: C.red, description: 'Unknown' },
  { status: 'learning', label: '~', color: C.amber, description: 'Learning' },
  { status: 'known', label: '✓', color: C.green, description: 'Known' },
  { status: 'ignored', label: '–', color: C.subtext, description: 'Ignore' },
];

function StatusIcon({ status, color }: { status: WordStatus; color: string }) {
  if (status === 'unknown') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    );
  } else if (status === 'learning') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    );
  } else if (status === 'known') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    );
  } else {
    // ignored
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="8" y1="12" x2="16" y2="12"></line>
      </svg>
    );
  }
}

interface StatusRowProps {
  currentStatus: WordStatus;
  onStatusChange: (status: WordStatus) => void;
  bulkCount?: number;
  onBulkMark?: (status: WordStatus) => void;
}

export function StatusRow({ currentStatus, onStatusChange, bulkCount, onBulkMark }: StatusRowProps) {
  const currentCfg = STATUS_CONFIG.find(cfg => cfg.status === currentStatus) || STATUS_CONFIG[0];

  const handleCycle = () => {
    const idx = STATUS_CONFIG.findIndex(cfg => cfg.status === currentStatus);
    const nextIdx = (idx + 1) % STATUS_CONFIG.length;
    onStatusChange(STATUS_CONFIG[nextIdx].status);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        onClick={handleCycle}
        title="Click to cycle status"
        style={{
          background: currentCfg.color,
          color: C.base,
          border: 'none',
          borderRadius: '16px',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 800,
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        <StatusIcon status={currentStatus} color={C.base} />
        {currentCfg.description}
      </button>

      {/* Bulk mark banner (if applicable) */}
      {bulkCount !== undefined && bulkCount > 1 && onBulkMark && (
        <span style={{ fontSize: '11px', color: C.subtext }}>
          ({bulkCount} selected)
        </span>
      )}
    </div>
  );
}
