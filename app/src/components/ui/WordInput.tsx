// src/components/ui/WordInput.tsx
import { useState } from 'react';

interface WordInputProps {
  label: string;
  placeholder?: string;
  onSubmit: (word: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function WordInput({
  label,
  placeholder,
  onSubmit,
  disabled = false,
  compact = false
}: WordInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue(''); // Clear après soumission
  };

  if (compact) {
    return (
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <label
          style={{
            fontSize: '13px',
            color: disabled ? '#666' : '#ccc',
            fontWeight: '500',
          }}
        >
          {label}
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
              color: disabled ? '#666' : '#f5f5f5',
              fontSize: '14px',
              outline: 'none',
              transition: 'all 0.2s',
            }}
            onFocus={(e) => {
              if (!disabled) {
                e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                e.target.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.target.style.background = disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)';
            }}
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              background: disabled || !value.trim() ?
                'rgba(255, 255, 255, 0.1)' :
                'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: disabled || !value.trim() ? '#666' : '#fff',
              cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
              minWidth: '36px',
            }}
          >
            →
          </button>
        </div>
      </form>
    );
  }

  // Version normale (non compact)
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <label>
        {label}{' '}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
        />
      </label>
      <button type="submit" disabled={disabled}>OK</button>
    </form>
  );
}
