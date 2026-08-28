import { useState, useEffect } from 'react';
import { fetchJson } from '../api/client';

const CATEGORIES = ['image', 'video', 'music', 'other'];

export default function AssetUpload({ onAssetsChange }) {
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchJson('/assets').then(setAssets).catch(() => {});
  }, []);

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
          headers: { 'Content-Type': file.type, 'X-Filename': file.name, 'X-Category': category },
          body: file,
        });
        const asset = await res.json();
        setAssets(prev => [...prev, asset]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  useEffect(() => { onAssetsChange?.(assets); }, [assets]);

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
      </div>
      {assets.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {assets.map((a, i) => (
            <div key={i} style={{
              padding: '4px 10px', backgroundColor: '#1a1a1a', borderRadius: 6,
              fontSize: 12, color: '#ccc', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: a.category === 'image' ? '#3b82f6' : a.category === 'video' ? '#a855f7' : a.category === 'music' ? '#22c55e' : '#888' }}>
                {a.category === 'image' ? '🖼' : a.category === 'video' ? '🎬' : a.category === 'music' ? '🎵' : '📄'}
              </span>
              {a.originalName}
              <span style={{ color: '#666' }}>{Math.round(a.size/1024)}KB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
