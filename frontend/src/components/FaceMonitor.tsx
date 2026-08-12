import { useEffect, useRef, useState } from 'react';

interface FaceMonitorProps {
  theme: 'light' | 'dark';
}

export function FaceMonitor({ theme }: FaceMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
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

  // Draw bounding boxes on overlay canvas
  const drawBoundingBoxes = (boxes: number[][], label: string, origWidth: number, origHeight: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Match overlay canvas size to displayed video size
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!boxes || boxes.length === 0 || !origWidth || !origHeight) return;

    const scaleX = overlay.width / origWidth;
    const scaleY = overlay.height / origHeight;

    const isIntruder = label.includes('INTRUDER');
    const isKnown = label.includes('KNOWN');

    const strokeColor = isIntruder ? '#ef4444' : isKnown ? '#10b981' : '#3b82f6';
    const bgColor = isIntruder ? 'rgba(239, 68, 68, 0.25)' : isKnown ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.25)';

    boxes.forEach(([x1, y1, x2, y2]) => {
      // Account for mirrored video scaleX(-1)
      const rectX = overlay.width - (x2 * scaleX);
      const rectY = y1 * scaleY;
      const rectW = (x2 - x1) * scaleX;
      const rectH = (y2 - y1) * scaleY;

      // Draw box background fill
      ctx.fillStyle = bgColor;
      ctx.fillRect(rectX, rectY, rectW, rectH);

      // Draw bounding box border
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(rectX, rectY, rectW, rectH);

      // Draw corner highlights
      const cornerLen = 15;
      ctx.lineWidth = 5;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(rectX, rectY + cornerLen); ctx.lineTo(rectX, rectY); ctx.lineTo(rectX + cornerLen, rectY); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(rectX + rectW - cornerLen, rectY); ctx.lineTo(rectX + rectW, rectY); ctx.lineTo(rectX + rectW, rectY + cornerLen); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(rectX, rectY + rectH - cornerLen); ctx.lineTo(rectX, rectY + rectH); ctx.lineTo(rectX + cornerLen, rectY + rectH); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(rectX + rectW - cornerLen, rectY + rectH); ctx.lineTo(rectX + rectW, rectY + rectH); ctx.lineTo(rectX + rectW, rectY + rectH - cornerLen); ctx.stroke();

      // Draw Label Tag
      const text = isIntruder ? '🚨 INTRUDER DETECTED' : isKnown ? `✅ ${label}` : label;
      ctx.font = 'bold 14px sans-serif';
      const textWidth = ctx.measureText(text).width;

      ctx.fillStyle = strokeColor;
      ctx.fillRect(rectX, Math.max(0, rectY - 26), textWidth + 16, 26);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, rectX + 8, Math.max(18, rectY - 8));
    });
  };

  // Initialize camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;
    let frameInterval: NodeJS.Timeout | null = null;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false 
        });
        
        if (isMounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
          setRegistrationStatus('');

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

                          if (data.boxes && data.frame_size) {
                            drawBoundingBoxes(data.boxes, data.label || '', data.frame_size[0], data.frame_size[1]);
                          } else {
                            drawBoundingBoxes([], '', 0, 0);
                          }
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
          }, 400);
        }
      } catch (error: any) {
        if (!isMounted) return;
        setCameraActive(false);
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
          {/* Live Bounding Box Tracking Overlay */}
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />
          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
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
