import { useState } from 'react';

const STYLES = [
  { value: 'product', label: 'Product Teaser' },
  { value: 'explainer', label: 'Explainer' },
  { value: 'social', label: 'Social Clip' },
];

export default function PromptForm({ onSubmit, loading }) {
  const [brief, setBrief] = useState('');
  const [durationSec, setDurationSec] = useState(10);
  const [style, setStyle] = useState('product');
  const [music, setMusic] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!brief.trim()) return;
    onSubmit({ brief: brief.trim(), durationSec, style, music });
    setBrief('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Describe your video..."
        rows={3}
        style={{
          width: '100%',
          padding: 12,
          backgroundColor: '#1a1a1a',
          color: '#fff',
          border: '1px solid #333',
          borderRadius: 8,
          fontSize: 14,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#aaa' }}>
          Duration:
          <input
            type="number"
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            min={1}
            max={180}
            style={{
              width: 60,
              marginLeft: 6,
              padding: '4px 8px',
              backgroundColor: '#1a1a1a',
              color: '#fff',
              border: '1px solid #333',
              borderRadius: 4,
            }}
          />
          s
        </label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          style={{
            padding: '4px 8px',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: 4,
          }}
        >
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={music}
            onChange={(e) => setMusic(e.target.checked)}
          />
          Music
        </label>
        <button
          type="submit"
          disabled={loading || !brief.trim()}
          style={{
            marginLeft: 'auto',
            padding: '8px 20px',
            backgroundColor: loading ? '#555' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {loading ? 'Creating...' : 'Create Video'}
        </button>
      </div>
    </form>
  );
}
