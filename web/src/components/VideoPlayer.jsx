import { getOutputUrl } from '../api/client';

export default function VideoPlayer({ jobId }) {
  if (!jobId) return null;
  return (
    <video
      controls
      autoPlay
      style={{ width: '100%', borderRadius: 8, backgroundColor: '#000' }}
      src={getOutputUrl(jobId)}
    />
  );
}
