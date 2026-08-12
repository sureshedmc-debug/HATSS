import { useEffect, useRef, useState } from 'react';

interface FaceMonitorProps {
  theme: 'light' | 'dark';
}

export function FaceMonitor({ theme }: FaceMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceStatus, setFaceStatus] = useState({ label: 'NO FACE', confidence: 0.0 });
  const [knownCount, setKnownCount] = useState(0);
  const [intrusionCount, setIntrusionCount] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationName, setRegistrationName] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationFrameCount, setRegistrationFrameCount] = useState(0);
  const [registrationFrames, setRegistrationFrames] = useState<Blob[]>([]);

  // Initialize camera - SIMPLIFIED
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;
    let frameInterval: NodeJS.Timeout | null = null;

    const initCamera = async () => {
      try {
        console.log('Attempting camera access...');
        
        // Request camera with no fancy constraints first
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false 
        });
        
        console.log('Camera stream obtained:', stream);
        
        if (isMounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          console.log('Stream attached to video element');
          setCameraActive(true);
          setRegistrationStatus('');

          // Start sending frames to backend for analysis (every 500ms)
          frameInterval = setInterval(() => {
            if (canvasRef.current && videoRef.current) {
              try {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                  ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                  canvasRef.current.toBlob(async (blob) => {
                    if (blob && isMounted) {
                      try {
                        const formData = new FormData();
                        formData.append('image', blob);
                        const response = await fetch('/api/v1/face/analyze-frame', {
                          method: 'POST',
                          body: formData,
                        });
                        const data = await response.json();
                        if (isMounted) {
                          setFaceStatus({
                            label: data.label || 'NO FACE',
                            confidence: data.confidence || 0.0
                          });
                        }
                      } catch (error) {
                        console.error('Frame analysis error:', error);
                      }
                    }
                  }, 'image/jpeg', 0.8);
                }
              } catch (error) {
                console.error('Frame capture error:', error);
              }
            }
          }, 500);
        }
      } catch (error: any) {
        if (!isMounted) return;
        
        console.error('❌ CAMERA ERROR:', error.name, error.message);
        setCameraActive(false);
        
        if (error.name === 'NotAllowedError') {
          setRegistrationStatus('🔒 Permission Denied - Click "Allow Camera" button or check browser settings');
        } else if (error.name === 'NotFoundError') {
          setRegistrationStatus('❌ No camera found - Check if camera hardware is connected');
        } else if (error.name === 'NotReadableError') {
          setRegistrationStatus('⚠️ Camera is locked - Close Zoom, Teams, or other camera apps');
        } else {
          setRegistrationStatus(`Error: ${error.name} - ${error.message}`);
        }
      }
    };

    // Delay slightly to ensure page is ready
    const timer = setTimeout(() => {
      if (isMounted) {
        initCamera();
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (frameInterval) {
        clearInterval(frameInterval);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fetch known faces and intrusion counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [knownRes, intrusionRes] = await Promise.all([
          fetch('/api/v1/face/known/count'),
          fetch('/api/v1/intrusions/count'),
        ]);

        const known = await knownRes.json();
        const intrusion = await intrusionRes.json();

        setKnownCount(known.count);
        setIntrusionCount(intrusion.count);
      } catch (error) {
        console.error('Fetch counts error:', error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  // Register face with 3 angles
  const handleRegisterFace = async () => {
    if (!registrationName.trim()) {
      setRegistrationStatus('Please enter a name');
      return;
    }

    if (!videoRef.current || !canvasRef.current) {
      setRegistrationStatus('Camera not ready');
      return;
    }

    try {
      setIsRegistering(true);
      setRegistrationFrameCount(0);
      setRegistrationFrames([]);

      const angles = [
        { number: 1, instruction: 'Position straight at camera' },
        { number: 2, instruction: 'Turn left slowly' },
        { number: 3, instruction: 'Turn right slowly' },
      ];

      const frames: Blob[] = [];

      // Capture 3 frames with 2-second positioning countdown per angle
      for (const angle of angles) {
        setRegistrationStatus(`📸 Angle ${angle.number}/3: ${angle.instruction} (Hold 2s...)`);
        setRegistrationFrameCount(angle.number);

        // 2-second countdown delay for positioning
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Capture frame
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');

        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

        const blob = await new Promise<Blob>((resolve) => {
          canvasRef.current!.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
        });

        frames.push(blob);
      }

      setRegistrationStatus('⏳ Extracting AI face features from 3 angles...');

      // Send all 3 frames to backend
      const formData = new FormData();
      formData.append('name', registrationName);
      frames.forEach((blob, idx) => {
        formData.append(`image_${idx + 1}`, blob);
      });

      const response = await fetch('/api/v1/face/register', {
        method: 'POST',
        body: formData,
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setRegistrationStatus(`✅ ${registrationName} registered successfully with 3 angles!`);
        setRegistrationName('');
        setRegistrationFrameCount(0);
        setRegistrationFrames([]);
        setTimeout(() => {
          setRegistrationStatus('');
        }, 3000);
      } else {
        setRegistrationStatus(`❌ ${resData.message || resData.detail || 'Registration failed'}`);
      }
    } catch (error) {
      setRegistrationStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsRegistering(false);
      setRegistrationFrameCount(0);
    }
  };

  const bgColor = theme === 'dark' ? 'bg-slate-950' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const borderColor = faceStatus.label.includes('INTRUDER')
    ? 'border-red-500'
    : faceStatus.label.includes('KNOWN')
      ? 'border-emerald-500'
      : 'border-slate-600';

  // Request camera permission manually
  const requestCameraPermission = async () => {
    try {
      const constraints = { 
        video: { facingMode: 'user' },
        audio: false 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setRegistrationStatus('');
      }
    } catch (error: any) {
      console.error('Camera permission error:', error);
      setRegistrationStatus(`❌ Camera permission denied: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Camera Feed - Always Show Video Element */}
      <div className={`${bgColor} rounded-2xl border-2 ${cameraActive ? 'border-cyan-500/50' : 'border-amber-500/50'} p-4 relative`}>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-medium text-slate-500 uppercase">📹 Live Camera Feed</p>
          {!cameraActive && (
            <button
              onClick={requestCameraPermission}
              className="text-xs px-2 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 transition z-10"
            >
              🔒 Allow Camera
            </button>
          )}
        </div>
        <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-50'}`}
            style={{ transform: 'scaleX(-1)' }}
          />
          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="text-white text-center text-sm">🔒 Camera Permission Needed<br/><span className="text-xs text-slate-300">Click "Allow Camera" button above</span></p>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} width={1280} height={720} style={{ display: 'none' }} />
      </div>

      {/* Camera Not Available Warning */}
      {!cameraActive && registrationStatus && (
        <div className={`${bgColor} rounded-2xl border-2 border-amber-500/50 bg-amber-500/5 p-4 space-y-4`}>
          <div>
            <p className="text-sm font-medium text-amber-400 mb-2">⚠️ Camera Access Issue</p>
            <p className="text-sm text-amber-200 mb-3">{registrationStatus}</p>
          </div>
          
          <div className="bg-amber-950/40 rounded-lg p-3 text-xs text-amber-100 space-y-2">
            <p className="font-medium">🔧 How to Fix:</p>
            <ol className="space-y-1 ml-2">
              <li>1. Click the "🔒 Allow Camera" button above</li>
              <li>2. Or: Click lock icon in browser address bar</li>
              <li>3. Find "Camera" → Select "Allow"</li>
              <li>4. Refresh the page</li>
              <li>5. Make sure no other app is using camera</li>
            </ol>
          </div>

          <div className="bg-cyan-950/40 rounded-lg p-3 text-xs text-cyan-100 space-y-2">
            <p className="font-medium">💻 Alternative: Python Registration Tool</p>
            <p className="text-cyan-200">If browser camera keeps failing, use this:</p>
            <code className="block mt-2 bg-slate-900/50 p-2 rounded text-cyan-300 overflow-x-auto">
              python workspace/camera_register.py
            </code>
            <p className="mt-2 text-cyan-300">✅ More reliable - uses direct camera access</p>
          </div>
        </div>
      )}

      {/* Face Status Card */}
      <div className={`${bgColor} rounded-2xl border-2 ${borderColor} p-6 transition`}>
        <p className={`text-sm font-medium text-slate-500 uppercase`}>Face Recognition Status</p>
        <p className={`text-3xl font-extrabold mt-2 ${
          faceStatus.label.includes('INTRUDER')
            ? 'text-red-500 animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]'
            : faceStatus.label.includes('KNOWN')
              ? 'text-emerald-400 font-extrabold drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]'
              : textColor
        }`}>{faceStatus.label}</p>
        <p className={`text-sm mt-1 font-mono ${textColor}`}>
          Confidence: {(faceStatus.confidence * 100).toFixed(1)}%
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`${bgColor} rounded-xl border border-slate-700 p-4`}>
          <p className="text-xs font-medium text-slate-500 uppercase">Known Persons</p>
          <p className={`text-2xl font-bold mt-2 ${textColor}`}>{knownCount}</p>
        </div>

        <div className={`${bgColor} rounded-xl border border-red-500/30 p-4 bg-red-500/5`}>
          <p className="text-xs font-medium text-red-500 uppercase">Intrusions Detected</p>
          <p className={`text-2xl font-bold mt-2 text-red-500`}>{intrusionCount}</p>
        </div>
      </div>

      {/* REGISTRATION SECTION - ALWAYS VISIBLE */}
      {cameraActive && (
        <div className={`${bgColor} rounded-2xl border-2 border-cyan-500/50 p-6 space-y-4 bg-gradient-to-br from-cyan-500/10 to-blue-500/10`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-cyan-400">✨ Register a New Person</p>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded">Camera Active</span>
          </div>
          
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter person's name..."
              value={registrationName}
              onChange={(e) => setRegistrationName(e.target.value)}
              className={`w-full px-4 py-2 rounded-lg border ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              disabled={isRegistering}
            />

            <p className="text-xs text-slate-400">
              📷 We'll capture 3 images: straight, left angle, right angle
            </p>

            {registrationStatus && (
              <p
                className={`text-sm font-medium ${
                  registrationStatus.includes('✅')
                    ? 'text-emerald-400'
                    : registrationStatus.includes('Error')
                    ? 'text-red-400'
                    : 'text-yellow-400'
                }`}
              >
                {registrationStatus}
              </p>
            )}

            <button
              onClick={handleRegisterFace}
              disabled={isRegistering || !registrationName.trim()}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <>⏳ Registering {registrationFrameCount}/3...</>
              ) : (
                <>✅ Register Face (3 Angles)</>
              )}
            </button>

            {isRegistering && registrationFrameCount > 0 && (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-2 rounded ${
                      i <= registrationFrameCount ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* REGISTRATION BUTTON - WHEN CAMERA NOT ACTIVE */}
      {!cameraActive && (
        <button
          onClick={() => setShowRegistration(!showRegistration)}
          className="w-full py-3 px-4 bg-slate-700/50 text-white font-semibold rounded-xl hover:bg-slate-600/50 transition cursor-not-allowed opacity-50"
          disabled
        >
          ➕ Register New Face (Enable camera first)
        </button>
      )}

      {/* COLLAPSIBLE REGISTRATION - BACKUP */}
      {cameraActive && showRegistration && (
        <div className={`${bgColor} rounded-2xl border-2 border-blue-500/50 p-6 space-y-3`}>
          <p className="text-sm font-medium text-blue-400">📝 Alternative Registration Form</p>
          <p className="text-xs text-slate-500">This is a backup form. Use the form above instead.</p>
        </div>
      )}
    </div>
  );
}
