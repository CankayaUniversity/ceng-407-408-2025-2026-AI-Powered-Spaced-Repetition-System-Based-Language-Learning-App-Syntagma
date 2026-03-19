import type { WordStatus } from '../../shared/types';

const C = {
  surface0: '#313244',
  surface1: '#45475a',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  blue: '#cba6f7',
  red: '#cba6f7',
  amber: '#fab387',
  green: '#a6e3a1',
  base: '#1e1e2e',
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

interface StatusRowProps {
  currentStatus: WordStatus;
  onStatusChange: (status: WordStatus) => void;
  bulkCount?: number;
  onBulkMark?: (status: WordStatus) => void;
}

export function StatusRow({ currentStatus, onStatusChange, bulkCount, onBulkMark }: StatusRowProps) {
  return (
    <div style={{ borderTop: `1px solid ${C.surface1}`, paddingTop: '8px' }}>
      {/* Bulk mark banner */}
      {bulkCount !== undefined && bulkCount > 1 && onBulkMark && (
        <div style={{
          background: C.surface0,
          borderRadius: '4px',
          padding: '4px 8px',
          marginBottom: '6px',
          fontSize: '11px',
          color: C.subtext,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{bulkCount} words selected</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {STATUS_CONFIG.map(cfg => (
              <button
                key={cfg.status}
                onClick={() => onBulkMark(cfg.status)}
                title={`Mark all as ${cfg.description}`}
                style={{
                  background: cfg.color,
                  color: C.base,
                  border: 'none',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                {cfg.description}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status buttons */}
      <div style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', color: C.subtext, marginRight: '2px' }}>Mark as:</span>
        {STATUS_CONFIG.map(cfg => {
          const isActive = currentStatus === cfg.status;
          return (
            <button
              key={cfg.status}
              onClick={() => onStatusChange(cfg.status)}
              title={cfg.description}
              style={{
                background: isActive ? cfg.color : C.surface0,
                color: isActive ? C.base : cfg.color,
                border: `1px solid ${cfg.color}`,
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 400,
                transition: 'all 0.12s',
                flex: 1,
              }}
            >
              <span style={{ marginRight: '3px' }}>{cfg.label}</span>
              {cfg.description}
            </button>
          );
        })}
      </div>
    </div>
  );
}
