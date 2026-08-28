export default function ProgressBar({ stage, progress }) {
  if (!stage) return null;
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: 4 }}>
        {stage} — {progress}%
      </div>
      <div style={{
        width: '100%',
        height: 6,
        backgroundColor: '#333',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: '#3b82f6',
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}
