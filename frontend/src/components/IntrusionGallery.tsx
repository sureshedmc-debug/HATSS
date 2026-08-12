import { useEffect, useState } from 'react';

interface IntrusionGalleryProps {
  theme: 'light' | 'dark';
}

export function IntrusionGallery({ theme }: IntrusionGalleryProps) {
  const [intrusions, setIntrusions] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({ total_events: 0, recent_events: 0 });

  useEffect(() => {
    const fetchIntrusions = async () => {
      try {
        const [metricsRes, listRes] = await Promise.all([
          fetch('/api/v1/intrusions/metrics'),
          fetch('/api/v1/intrusions/list?limit=6'),
        ]);

        const metricsData = await metricsRes.json();
        const listData = await listRes.json();

        setMetrics(metricsData);
        setIntrusions(listData);
      } catch (error) {
        console.error('Intrusion data error:', error);
      }
    };

    fetchIntrusions();
    const interval = setInterval(fetchIntrusions, 1500);
    return () => clearInterval(interval);
  }, []);

  const bgColor = theme === 'dark' ? 'bg-slate-950' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const borderColor = theme === 'dark' ? 'border-slate-700' : 'border-slate-300';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Total Events</p>
          <p className={`text-2xl font-bold mt-2 ${textColor}`}>{metrics.total_events}</p>
        </div>

        <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Recent Images</p>
          <p className={`text-2xl font-bold mt-2 ${textColor}`}>{metrics.recent_events}</p>
        </div>
      </div>

      <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
        <p className="text-xs font-medium text-slate-500 uppercase mb-3">Latest Alerts</p>

        {intrusions.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">✅ No intrusions detected</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 overflow-y-auto max-h-64">
            {intrusions.map((image) => {
              const imageUrl = `/api/v1/intrusions/snap/${image}`;
              return (
                <a
                  key={image}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg overflow-hidden border border-red-500/30 hover:border-red-500 hover:shadow-lg transition group bg-slate-900/50"
                >
                  <img
                    src={imageUrl}
                    alt="Intruder Snapshot"
                    className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `/intruder_snaps/${image}`;
                    }}
                  />
                  <div className="bg-red-500/10 p-1.5 text-center border-t border-red-500/20">
                    <p className="text-[10px] text-red-400 font-mono truncate">{image}</p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
