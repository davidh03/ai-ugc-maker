import { useState, useEffect, useRef } from 'react';
import { getModels } from '../api/client';
import AssetUpload from './AssetUpload';

const STYLES = [
  { value: 'product', label: 'Product Teaser' },
  { value: 'explainer', label: 'Explainer' },
  { value: 'social', label: 'Social Clip' },
];
const AGENTS = [
  { value: 'none', label: 'Template (no AI)' },
  { value: 'opencode', label: 'OpenCode' },
];

const LS_KEY = 'aiugc-maker-form-v1';

function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return d;
  } catch { return null; }
}

export default function PromptForm({ onSubmit, loading }) {
  const [brief, setBrief] = useState('');
  const [durationSec, setDurationSec] = useState(10);
  const [style, setStyle] = useState('product');
  const [music, setMusic] = useState(false);
  const [agent, setAgent] = useState('none');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [assets, setAssets] = useState([]);
  const hydrated = useRef(false);

  // Functional-update-safe setAssets: AssetUpload passes updater fns.
  const updateAssets = (updater) => setAssets(prev => typeof updater === 'function' ? updater(prev) : updater);

  // Restore last-used settings + asset chips on mount (first pass only)
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (typeof draft.brief === 'string') setBrief(draft.brief);
      if (typeof draft.durationSec === 'number') setDurationSec(draft.durationSec);
      if (STYLES.some(s => s.value === draft.style)) setStyle(draft.style);
      if (typeof draft.music === 'boolean') setMusic(draft.music);
      if (AGENTS.some(a => a.value === draft.agent)) setAgent(draft.agent);
      if (typeof draft.model === 'string') setModel(draft.model);
      if (Array.isArray(draft.assets) && draft.assets.length > 0) setAssets(draft.assets);
    }
    hydrated.current = true;
  }, []);

  // Persist on every change — but never on the very first render, so the
  // restore above can't be clobbered by an empty-state write.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ brief, durationSec, style, music, agent, model, assets }));
    } catch {}
  }, [brief, durationSec, style, music, agent, model, assets]);

  useEffect(() => { getModels().then(setModels).catch(() => {}); }, []);
  // Keep the selected model valid against the live list: prefer a known-good
  // free Zen model, and if a saved model is stale (e.g. opencode-go/* from
  // before the Zen migration) reset it instead of leaving a dead selection.
  useEffect(() => {
    if (!models.length) return;
    const preferred = ['opencode/mimo-v2.5-free', 'opencode/hy3-free', 'opencode/big-pickle']
      .find(id => models.some(m => m.id === id)) || models[0].id;
    if (!model || !models.some(m => m.id === model)) setModel(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!brief.trim()) return;
    onSubmit({
      brief: brief.trim(),
      durationSec,
      style,
      music,
      agent,
      model: agent !== 'none' ? model : undefined,
      assets: assets.length ? assets : undefined,
    });
    setBrief('');
  };

  const sel = { padding: '4px 8px', backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 6, fontSize: 13 };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <AssetUpload onAssetsChange={updateAssets} assets={assets} />
      <textarea
        value={brief}
        onChange={e => setBrief(e.target.value)}
        placeholder="Describe your video..."
        rows={3}
        style={{ width: '100%', padding: 12, backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 8, fontSize: 14 }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#aaa' }}>
          Duration:{' '}
          <input
            type="number"
            value={durationSec}
            onChange={e => setDurationSec(Number(e.target.value))}
            min={1}
            max={180}
            style={{ width: 60, marginLeft: 6, padding: '4px 8px', backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 6, fontSize: 13 }}
          />
        </label>
        <select value={style} onChange={e => setStyle(e.target.value)} style={sel}>
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={agent} onChange={e => setAgent(e.target.value)} style={sel}>
          {AGENTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {agent !== 'none' && models.length > 0 && (
          <select value={model} onChange={e => setModel(e.target.value)} style={sel}>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <label style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={music} onChange={e => setMusic(e.target.checked)} /> Music
        </label>
        {assets.length > 0 && (
          <span style={{ fontSize: 12, color: '#6ee7a0', fontWeight: 600 }}>
            ✓ {assets.length} asset{assets.length > 1 ? 's' : ''} will be attached
          </span>
        )}
        <button type="submit" disabled={loading || !brief.trim()} style={{ marginLeft: 'auto', padding: '8px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          {loading ? 'Creating...' : 'Create Video'}
        </button>
      </div>
    </form>
  );
}