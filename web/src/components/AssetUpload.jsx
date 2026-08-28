import { useState } from 'react';

export default function AssetUpload({ assets = [], onAssetsChange }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const category = file.type.startsWith('image/') ? 'image'
          : file.type.startsWith('video/') ? 'video'
          : file.type.startsWith('audio/') ? 'music'
          : 'other';
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
            'X-Filename': file.name,
            'X-Category': category,
            'X-Required': 'true', // assets default to REQUIRED (must be in the video)
          },
          body: file,
        });
        const asset = await res.json();
        onAssetsChange?.([...assets, asset]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleRequired = (i) => {
    onAssetsChange?.(assets.map((a, idx) => idx === i ? { ...a, required: a.required === false } : a));
  };

  const removeAsset = (i) => {
    onAssetsChange?.(assets.filter((_, idx) => idx !== i));
  };

  const chip = (a, i) => (
    <div key={a.id || a.filename || i} style={{
      padding: '4px 10px', backgroundColor: '#1a1a1a', borderRadius: 6,
      fontSize: 12, color: '#ccc', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ color: a.category === 'image' ? '#3b82f6' : a.category === 'video' ? '#a855f7' : a.category === 'music' ? '#22c55e' : '#888' }}>
        {a.category === 'image' ? '🖼' : a.category === 'video' ? '🎬' : a.category === 'music' ? '🎵' : '📄'}
      </span>
      {a.originalName || a.filename}
      <span style={{ color: '#666' }}>{Math.round((a.size || 0)/1024)}KB</span>
      <button
        type="button"
        onClick={() => toggleRequired(i)}
        title="Toggle required / optional"
        style={{
          border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
          fontSize: 11, fontWeight: 600,
          backgroundColor: a.required === false ? '#444' : '#b45309',
          color: '#fff',
        }}
      >
        {a.required === false ? 'OPTIONAL' : 'REQUIRED'}
      </button>
      <button
        type="button"
        onClick={() => removeAsset(i)}
        title="Remove"
        style={{ border: 'none', background: 'none', color: '#666', cursor: 'pointer', fontSize: 13, padding: 0 }}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <label style={{
          padding: '6px 14px', backgroundColor: '#1a1a1a', color: '#aaa', border: '1px dashed #555',
          borderRadius: 6, cursor: 'pointer', fontSize: 13,
        }}>
          {uploading ? 'Uploading...' : '+ Add Assets (images, clips, music)'}
          <input type="file" multiple accept="image/*,video/*,audio/*" onChange={handleUpload} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 12, color: '#666' }}>{assets.length} asset(s)</span>
        <span style={{ fontSize: 11, color: '#888' }}>REQUIRED = must appear in the video</span>
      </div>
      {assets.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {assets.map(chip)}
        </div>
      )}
    </div>
  );
}