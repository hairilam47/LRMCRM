export function LoadingWave() {
  return (
    <div className="w-full flex justify-center py-16">
      <div className="loading-wave" role="status" aria-label="Loading">
        <div className="loading-bar" /><div className="loading-bar" /><div className="loading-bar" /><div className="loading-bar" />
      </div>
    </div>
  );
}
