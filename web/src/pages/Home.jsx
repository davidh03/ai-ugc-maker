import { useState } from 'react';
import { useJobs } from '../hooks/useJobs';
import PromptForm from '../components/PromptForm';
import JobCard from '../components/JobCard';

export default function Home() {
  const { jobs, loading, createJob } = useJobs();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (data) => {
    setCreating(true);
    try {
      await createJob(data);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Create Video</h2>
      <PromptForm onSubmit={handleCreate} loading={creating} />
      <h2 style={{ marginBottom: 12, color: '#aaa' }}>History</h2>
      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {!loading && jobs.length === 0 && <p style={{ color: '#666' }}>No videos yet</p>}
      {jobs.map(job => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
