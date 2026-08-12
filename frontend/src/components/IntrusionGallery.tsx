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
  const borderColor = theme === 'dark' ? 'border-slate-800' : 'border-slate-300';

  // Helper to format snapshot filename (e.g. 1786564138.jpg) into exact Date & Time
  const formatSnapshotTime = (filename: string) => {
    const cleanName = filename.replace('.jpg', '').replace('.png', '');
    const ts = parseInt(cleanName, 10);
    if (!isNaN(ts) && ts > 1000000000) {
      const d = new Date(ts * 1000);
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      return { date: dateStr, time: timeStr };
    }
    return { date: 'Today', time: 'Just now' };
  };

  return (
    <div className="space-y-4">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Total Intrusions</p>
          <p className={`text-2xl font-bold mt-1 ${textColor}`}>{metrics.total_events}</p>
        </div>

        <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Recent Captured Photos</p>
          <p className={`text-2xl font-bold mt-1 ${textColor}`}>{metrics.recent_events}</p>
        </div>
      </div>

      {/* Latest Alerts Gallery */}
      <div className={`${bgColor} rounded-xl border ${borderColor} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">🚨 Latest Alerts & Intruder Snaps</p>
          <span className="text-[10px] text-red-400 font-mono font-bold animate-pulse bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            LIVE UPDATING
          </span>
        </div>

        {intrusions.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-lg">
            <p className="text-sm text-emerald-400 font-medium">✅ No Intruders Detected Yet</p>
            <p className="text-xs text-slate-500 mt-1">Intruder snapshots will appear here automatically in real time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto max-h-80">
            {intrusions.map((image, index) => {
              const imageUrl = `/api/v1/intrusions/snap/${image}`;
              const { date, time } = formatSnapshotTime(image);
              const intruderIndex = index + 1;

              return (
                <a
                  key={image}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative rounded-xl overflow-hidden border border-red-500/30 bg-slate-900/80 hover:border-red-500 hover:shadow-xl hover:shadow-red-500/10 transition-all duration-300 flex flex-col"
                >
                  {/* Photo Container */}
                  <div className="relative w-full h-36 bg-black overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`Intruder ${intruderIndex}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `/intruder_snaps/${image}`;
                      }}
                    />
                    {/* Badge Overlay */}
                    <div className="absolute top-2 left-2 bg-red-600/90 text-white font-extrabold text-xs px-2 py-0.5 rounded-md shadow-md backdrop-blur-sm border border-red-400/40">
                      Intruder {intruderIndex}
                    </div>
                  </div>

                  {/* Date & Time Footer Label */}
                  <div className="bg-slate-950 p-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1 text-slate-300">
                      <span>📅</span>
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-400 font-bold">
                      <span>⏰</span>
                      <span>{time}</span>
                    </div>
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
