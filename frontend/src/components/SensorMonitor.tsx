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
  status: string;
}

export function SensorMonitor({ theme }: SensorMonitorProps) {
  const [sensors, setSensors] = useState<SensorState>({
    fire: false,
    pir: false,
    gas: false,
    raw_gas: 420,
    mq2_rating: 1,
    water: 65,
    raw_water: 2400,
    buzzer: false,
    muted: false,
    last_update: 'Not received',
    status: 'disconnected'
  });

  useEffect(() => {
    const fetchSensors = async () => {
      try {
        // First try local backend relay
        const res = await fetch('/api/v1/sensors/status');
        if (res.ok) {
          const data = await res.json();
          setSensors(data);
        } else {
          // Direct fallback to ESP32 IP
          const espRes = await fetch('http://192.168.4.1/api/sensors');
          if (espRes.ok) {
            const espData = await espRes.json();
            setSensors({
              fire: espData.flame,
              pir: espData.ir,
              gas: espData.gas,
              raw_gas: espData.raw_gas || 400,
              mq2_rating: espData.mq2_rating || 1,
              water: espData.water || 0,
              raw_water: espData.raw_water || 0,
              buzzer: espData.buzzer || false,
              muted: espData.muted || false,
              last_update: new Date().toLocaleTimeString(),
              status: 'connected'
            });
          }
        }
      } catch (error) {
        console.error('Sensor status fetch error:', error);
      }
    };

    fetchSensors();
    const interval = setInterval(fetchSensors, 1000);
    return () => clearInterval(interval);
  }, []);

  const bgColor = theme === 'dark' ? 'bg-slate-950' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const borderColor = theme === 'dark' ? 'border-slate-800' : 'border-slate-300';

  const isGasHazard = sensors.raw_gas > 2200 || sensors.gas;
  const isWaterLow = sensors.water <= 15;

  return (
    <div className="space-y-4">
      {/* Dynamic Wave Keyframe Injection */}
      <style>{`
        @keyframes wave {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-wave {
          animation: wave 3s infinite linear;
        }
      `}</style>

      {/* Header Info */}
      <div className={`${bgColor} rounded-xl border ${borderColor} p-4 flex items-center justify-between`}>
        <div>
          <p className="text-xs text-slate-500 font-medium">ESP32 Hardware Sensors (IP: 192.168.4.1)</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">Last Sync: {sensors.last_update}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
          sensors.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {sensors.status === 'connected' ? '🟢 ESP32 CONNECTED' : '🟡 SEARCHING ESP32'}
        </span>
      </div>

      {/* Sensor Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Fire Sensor Widget */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          sensors.fire ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-4`}>
          <div className="flex items-center justify-between">
            <div className="text-3xl">🔥</div>
            <div className={`w-3 h-3 rounded-full ${sensors.fire ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-3">Flame / Fire Sensor</p>
          <p className={`text-xl font-bold mt-1 ${sensors.fire ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {sensors.fire ? '🔥 FIRE DETECTED!' : 'SAFE'}
          </p>
        </div>

        {/* 2. Motion IR Sensor Widget */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          sensors.pir ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-4`}>
          <div className="flex items-center justify-between">
            <div className="text-3xl">👁️</div>
            <div className={`w-3 h-3 rounded-full ${sensors.pir ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-3">IR Motion Sensor (D27)</p>
          <p className={`text-xl font-bold mt-1 ${sensors.pir ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {sensors.pir ? '🚨 MOTION DETECTED' : 'ALL CLEAR'}
          </p>
        </div>

        {/* 3. MQ2 Gas Sensor Widget (AO Number + 2200 Threshold) */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isGasHazard ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-4`}>
          <div className="flex items-center justify-between">
            <div className="text-3xl">💨</div>
            <div className={`w-3 h-3 rounded-full ${isGasHazard ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase mt-3">MQ2 Gas Sensor (AO Pin D33)</p>
          <div className="mt-1 flex items-baseline justify-between">
            <p className={`text-2xl font-black font-mono ${isGasHazard ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
              {sensors.raw_gas} <span className="text-xs font-normal text-slate-400">AO</span>
            </p>
            <span className="text-xs font-mono text-slate-400">({sensors.mq2_rating}/10)</span>
          </div>
          <div className="mt-2 flex justify-between items-center text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-1.5">
            <span>Threshold: 2200</span>
            <span className={isGasHazard ? 'text-red-400 font-bold' : 'text-emerald-400'}>
              {isGasHazard ? '🚨 HAZARD GAS!' : 'NORMAL AIR'}
            </span>
          </div>
        </div>

        {/* 4. Water Level Sensor Widget with CSS Fluid Beaker Tank Animation */}
        <div className={`${bgColor} rounded-2xl border transition-all ${
          isWaterLow ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20' : borderCard(theme)
        } p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-3">
              <div className="flex items-center justify-between">
                <div className="text-2xl">💧</div>
                <div className={`w-2.5 h-2.5 rounded-full ${isWaterLow ? 'bg-red-500 animate-ping' : 'bg-cyan-400'}`} />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase mt-2">Water Level (D34)</p>
              <p className={`text-xl font-bold font-mono mt-0.5 ${isWaterLow ? 'text-red-500' : 'text-cyan-400'}`}>
                {sensors.water}% <span className="text-xs text-slate-500 font-normal">({sensors.raw_water})</span>
              </p>
              <p className={`text-[10px] font-bold mt-1.5 ${isWaterLow ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                {isWaterLow ? '🚨 WATER LEVEL LOW!' : 'LEVEL SAFE'}
              </p>
            </div>

            {/* Live CSS Fluid Beaker Tank Animation */}
            <div className="relative w-12 h-20 border-2 border-slate-600 rounded-lg bg-slate-900/80 overflow-hidden shadow-inner flex flex-col justify-end">
              {/* Beaker Cap */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-1.5 bg-slate-700 rounded-b" />
              
              {/* Fluid Water Level */}
              <div
                className="w-full bg-gradient-to-t from-blue-700 to-cyan-400 relative transition-all duration-700 ease-out"
                style={{ height: `${Math.min(100, Math.max(0, sensors.water))}%` }}
              >
                {/* Surface Wave */}
                <div className="absolute -top-2 -left-1/2 w-[200%] h-3 bg-cyan-200/40 rounded-[38%] animate-wave pointer-events-none" />
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
