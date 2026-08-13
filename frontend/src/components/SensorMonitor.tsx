import { useEffect, useState } from 'react';

interface SensorMonitorProps {
  theme: 'light' | 'dark';
}

interface SensorState {
  fire: boolean;
  pir: boolean;
  gas: boolean;
  raw_gas: number;
  mq2_rating: number;
  water: number;
  raw_water: number;
  buzzer: boolean;
  muted: boolean;
  last_update: string;
  status: 'connected' | 'connecting' | 'disconnected';
  uptime?: number;
}

export function SensorMonitor({ theme }: SensorMonitorProps) {
  // Pure live state - No fake values
  const [sensors, setSensors] = useState<SensorState>({
    fire: false,
    pir: false,
    gas: false,
    raw_gas: 0,
    mq2_rating: 0,
    water: 0,
    raw_water: 0,
    buzzer: false,
    muted: false,
    last_update: 'Waiting for ESP32...',
    status: 'connecting',
    uptime: 0
  });

  useEffect(() => {
    const fetchSensorsDirect = async () => {
      const endpoints = [
        'http://192.168.4.1/api/sensors',
        'http://192.168.4.1/sensors',
        'http://192.168.4.1/data',
        'http://192.168.4.1/json',
        'http://192.168.4.1/read'
      ];

      // 1. Try Direct HTTP GET to ESP32 IP 192.168.4.1
      for (const url of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          const espRes = await fetch(url, { method: 'GET', signal: controller.signal });
          clearTimeout(timeoutId);

          if (espRes.ok) {
            const espData = await espRes.json();
            setSensors({
              fire: Boolean(espData.flame ?? espData.fire),
              pir: Boolean(espData.ir ?? espData.pir ?? espData.motion),
              gas: Boolean(espData.gas ?? (espData.raw_mq2 > 2200)),
              raw_gas: Number(espData.raw_mq2 ?? espData.raw_gas ?? espData.mq2 ?? 400),
              mq2_rating: Number(espData.mq2_rating ?? 1),
              water: Number(espData.water ?? 50),
              raw_water: Number(espData.raw_water ?? 2400),
              buzzer: Boolean(espData.buzzer),
              muted: Boolean(espData.muted),
              last_update: new Date().toLocaleTimeString(),
              status: 'connected',
              uptime: espData.uptime || 0
            });
            return;
          }
        } catch (e) {
          // Continue to next endpoint
        }
      }

      // 2. Fallback to Backend Relay API (which also polls http://192.168.4.1 on server-side)
      try {
        const res = await fetch('/api/v1/sensors/status');
        if (res.ok) {
          const data = await res.json();
          setSensors({
            ...data,
            status: data.status === 'connected' ? 'connected' : 'connecting'
          });
        }
      } catch (err) {
        console.error('Sensor fetch error:', err);
      }
    };

    fetchSensorsDirect();
    const interval = setInterval(fetchSensorsDirect, 800); // 800ms fast real-time poll
    return () => clearInterval(interval);
  }, []);

  const bgColor = theme === 'dark' ? 'bg-slate-950' : 'bg-white';
  const borderColor = theme === 'dark' ? 'border-slate-800' : 'border-slate-300';

  const isConnected = sensors.status === 'connected';
  const isGasHazard = isConnected && (sensors.raw_gas > 2200 || sensors.gas);
  const isWaterLow = isConnected && sensors.water <= 15;

  return (
    <div className="space-y-4">
      {/* Wave Animation Styles */}
      <style>{`
        @keyframes wave {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-wave-fluid {
          animation: wave 3s infinite linear;
        }
      `}</style>

      {/* Header Info */}
      <div className={`${bgColor} rounded-xl border ${borderColor} p-4 flex items-center justify-between`}>
        <div>
          <p className="text-xs text-slate-500 font-medium">ESP32 Hardware Direct IP: http://192.168.4.1/api/sensors</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {isConnected ? `Last Sync: ${sensors.last_update} • Uptime: ${sensors.uptime || 0}s` : 'Waiting for hardware connection...'}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {isConnected ? '🟢 ESP32 LIVE CONNECTED' : '🟡 SEARCHING ESP32 (192.168.4.1)'}
        </span>
      </div>

      {/* Sensor Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Flame Detection Widget */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isConnected && sensors.fire ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-5`}>
          <div className="flex items-center justify-between">
            <div className="text-4xl">🔥</div>
            <div className={`w-3.5 h-3.5 rounded-full ${
              !isConnected ? 'bg-slate-600' : sensors.fire ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
            }`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-4">Flame Detection</p>
          <p className={`text-2xl font-bold mt-1 ${
            !isConnected ? 'text-slate-500' : sensors.fire ? 'text-red-500 animate-pulse' : 'text-emerald-400'
          }`}>
            {!isConnected ? '--' : sensors.fire ? '🔥 FIRE DETECTED!' : 'SAFE'}
          </p>
        </div>

        {/* 2. Intrusion Detection Widget */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isConnected && sensors.pir ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-5`}>
          <div className="flex items-center justify-between">
            <div className="text-4xl">👁️</div>
            <div className={`w-3.5 h-3.5 rounded-full ${
              !isConnected ? 'bg-slate-600' : sensors.pir ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
            }`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-4">Intrusion Detection</p>
          <p className={`text-2xl font-bold mt-1 ${
            !isConnected ? 'text-slate-500' : sensors.pir ? 'text-red-500 animate-pulse' : 'text-emerald-400'
          }`}>
            {!isConnected ? '--' : sensors.pir ? '🚨 MOTION DETECTED' : 'ALL CLEAR'}
          </p>
        </div>

        {/* 3. Gas Detection Widget */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isGasHazard ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-5`}>
          <div className="flex items-center justify-between">
            <div className="text-4xl">💨</div>
            <div className={`w-3.5 h-3.5 rounded-full ${
              !isConnected ? 'bg-slate-600' : isGasHazard ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
            }`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-4">Gas Detection</p>
          <div className="mt-1 flex items-baseline justify-between">
            <p className={`text-3xl font-black font-mono ${
              !isConnected ? 'text-slate-500' : isGasHazard ? 'text-red-500 animate-pulse' : 'text-emerald-400'
            }`}>
              {isConnected ? sensors.raw_gas : '--'} <span className="text-xs font-normal text-slate-400">AO</span>
            </p>
            <span className="text-xs font-mono text-slate-400">
              {isConnected ? `(${sensors.mq2_rating}/10)` : '(--/10)'}
            </span>
          </div>
          <div className="mt-3 flex justify-between items-center text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
            <span>Threshold: 2200</span>
            <span className={!isConnected ? 'text-slate-500' : isGasHazard ? 'text-red-400 font-bold' : 'text-emerald-400'}>
              {!isConnected ? 'NO DATA' : isGasHazard ? '🚨 HAZARD GAS!' : 'NORMAL AIR'}
            </span>
          </div>
        </div>

        {/* 4. River Overflow Detection Widget with Large CSS Fluid Beaker Animation */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isWaterLow ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-5 col-span-1 md:col-span-2 lg:col-span-1`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-3xl">🌊</div>
                <div className={`w-3 h-3 rounded-full ${
                  !isConnected ? 'bg-slate-600' : isWaterLow ? 'bg-red-500 animate-ping' : 'bg-cyan-400'
                }`} />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase mt-3">River Overflow Detection</p>
              <p className={`text-3xl font-black font-mono mt-1 ${
                !isConnected ? 'text-slate-500' : isWaterLow ? 'text-red-500' : 'text-cyan-400'
              }`}>
                {isConnected ? `${sensors.water}%` : '--'}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                ADC: {isConnected ? sensors.raw_water : '--'}
              </p>
              <p className={`text-xs font-bold mt-2 ${
                !isConnected ? 'text-slate-500' : isWaterLow ? 'text-red-400 animate-pulse' : 'text-emerald-400'
              }`}>
                {!isConnected ? 'NO DATA' : isWaterLow ? '🚨 WATER LEVEL LOW!' : 'LEVEL SAFE'}
              </p>
            </div>

            {/* BIGGER Live CSS Fluid Beaker Tank Container */}
            <div className="relative w-20 h-32 border-2 border-cyan-500/40 rounded-xl bg-slate-900/90 overflow-hidden shadow-2xl shadow-cyan-500/10 flex flex-col justify-end">
              {/* Beaker Lip / Cap */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-2 bg-slate-700 rounded-b shadow-md z-20" />
              
              {/* Beaker Scale Measurement Lines */}
              <div className="absolute left-1 inset-y-2 flex flex-col justify-between text-[8px] font-mono text-cyan-300/40 z-20 pointer-events-none">
                <span>100</span>
                <span>75</span>
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>

              {/* Fluid Water Level */}
              <div
                className="w-full bg-gradient-to-t from-blue-700 via-blue-600 to-cyan-400 relative transition-all duration-700 ease-out z-10"
                style={{ height: `${isConnected ? Math.min(100, Math.max(0, sensors.water)) : 0}%` }}
              >
                {/* Fluid Surface Wave Animation */}
                {isConnected && (
                  <div className="absolute -top-3 -left-1/2 w-[200%] h-5 bg-cyan-200/50 rounded-[38%] animate-wave-fluid pointer-events-none" />
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function borderCard(theme: string) {
  return theme === 'dark' ? 'border-slate-800 bg-slate-900/50 hover:border-slate-700' : 'border-slate-200 bg-white hover:border-slate-300';
}
