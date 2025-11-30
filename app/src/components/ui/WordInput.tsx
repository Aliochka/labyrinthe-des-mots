// src/components/ui/WordInput.tsx
import { useState } from 'react';

interface WordInputProps {
  label: string;
  placeholder?: string;
  onSubmit: (word: string) => void;
}

export function WordInput({ label, placeholder, onSubmit }: WordInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <label>
        {label}{' '}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button type="submit">
        OK
      </button>
    </form>
  );
}
