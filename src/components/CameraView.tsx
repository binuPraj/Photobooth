import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Upload, AlertCircle, Sparkles, Check, Trash2, Users, Link2, Copy, Unlink, Heart } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout } from '../types';
import Peer from 'peerjs';
import { mergePhotosSideBySide } from '../utils/photoMerge';

interface CameraViewProps {
  layout: Layout;
  onPhotosCaptured: (photos: string[]) => void;
  onPhotosUploaded: (photos: string[]) => void;
  countdownDuration: number;
}

export const CameraView: React.FC<CameraViewProps> = ({
  layout,
  onPhotosCaptured,
  onPhotosUploaded,
  countdownDuration
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const partnerVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  
  // Capture states
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [currentCaptureStep, setCurrentCaptureStep] = useState<number>(-1);
  const [countdown, setCountdown] = useState<number>(0);
  const [tempCapturedPhotos, setTempCapturedPhotos] = useState<string[]>([]);
  const [flashActive, setFlashActive] = useState<boolean>(false);

  // Upload state
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);

  // Couple Mode (PeerJS) states
  const [coupleModeActive, setCoupleModeActive] = useState<boolean>(false);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [conn, setConn] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [peerIdCode, setPeerIdCode] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [partnerStream, setPartnerStream] = useState<MediaStream | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [connectionStatusText, setConnectionStatusText] = useState<string>('');

  // Dual photo store for merging
  const [myPhotos, setMyPhotos] = useState<{ [key: number]: string }>({});
  const [partnerPhotos, setPartnerPhotos] = useState<{ [key: number]: string }>({});

  // Check camera permissions and list cameras
  useEffect(() => {
    checkPermissionsAndDevices();
    return () => {
      stopCamera();
      cleanupPeer();
    };
  }, []);

  // Sync partner stream to DOM element
  useEffect(() => {
    if (partnerVideoRef.current && partnerStream) {
      partnerVideoRef.current.srcObject = partnerStream;
    }
  }, [partnerStream]);

  const checkPermissionsAndDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setPermissionState('denied');
      setErrorMsg('Webcam API is not supported by your browser.');
      setMode('upload');
      return;
    }

    try {
      setPermissionState('checking');
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devList.filter(d => d.kind === 'videoinput');
      setDevices(videoDevs);
      
      if (videoDevs.length > 0) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop()); // close immediately
      
      setPermissionState('granted');
      startCamera(videoDevs[0]?.deviceId || '');
    } catch (err: any) {
      console.error('Camera permission check failed:', err);
      setPermissionState('denied');
      setMode('upload');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera access was denied. Please allow camera permissions or upload images instead.');
      } else {
        setErrorMsg('Could not access camera. Please make sure no other app is using it.');
      }
    }
  };

  const startCamera = async (deviceId: string) => {
    stopCamera();
    setErrorMsg('');

    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPermissionState('granted');
      
      // If couple mode is active and we are connected, update/initiate call with new stream
      if (isConnected && conn && currentCall) {
        // Redo the call with the new stream
        const partnerPeerId = conn.peer;
        currentCall.close();
        
        const newCall = peer?.call(partnerPeerId, stream);
        if (newCall) {
          setCurrentCall(newCall);
          newCall.on('stream', (remoteStream) => {
            setPartnerStream(remoteStream);
          });
        }
      }
    } catch (err: any) {
      console.error('Error starting camera:', err);
      setErrorMsg('Error opening camera stream.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const cleanupPeer = () => {
    if (currentCall) currentCall.close();
    if (conn) conn.close();
    if (peer) {
      peer.destroy();
    }
    setPeer(null);
    setConn(null);
    setCurrentCall(null);
    setIsConnected(false);
    setPartnerStream(null);
    setMyPhotos({});
    setPartnerPhotos({});
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    startCamera(newId);
  };

  // --- Couple Session Handlers ---

  const handleCreateSession = () => {
    cleanupPeer();
    setConnectionStatusText('Generating session code...');
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const peerId = `pb-${randomCode}`;

    const newPeer = new Peer(peerId, {
      debug: 1
    });

    newPeer.on('open', () => {
      setPeer(newPeer);
      setPeerIdCode(randomCode);
      setIsHost(true);
      setConnectionStatusText('Waiting for partner to join...');
    });

    newPeer.on('error', (err) => {
      console.error('Peer creation error:', err);
      setConnectionStatusText('Code already taken. Please try again.');
    });

    // Listen for incoming connection
    newPeer.on('connection', (connection) => {
      setConn(connection);
      setupDataConnection(connection);
    });

    // Listen for incoming video call
    newPeer.on('call', (call) => {
      if (streamRef.current) {
        call.answer(streamRef.current);
        setCurrentCall(call);
        call.on('stream', (remoteStream) => {
          setPartnerStream(remoteStream);
          setIsConnected(true);
          setConnectionStatusText('Partner connected!');
        });
      } else {
        // Fallback answer even if no local camera stream is running
        call.answer();
        setCurrentCall(call);
        call.on('stream', (remoteStream) => {
          setPartnerStream(remoteStream);
          setIsConnected(true);
          setConnectionStatusText('Partner connected!');
        });
      }
    });
  };

  const handleJoinSession = () => {
    if (!joinCodeInput || joinCodeInput.length !== 6) {
      setConnectionStatusText('Please enter a valid 6-digit code.');
      return;
    }
    
    cleanupPeer();
    setConnectionStatusText('Connecting to session...');
    
    const newPeer = new Peer();
    
    newPeer.on('open', () => {
      setPeer(newPeer);
      setIsHost(false);
      
      const hostId = `pb-${joinCodeInput}`;
      const connection = newPeer.connect(hostId);
      setConn(connection);
      setupDataConnection(connection);

      // Call the host
      if (streamRef.current) {
        const call = newPeer.call(hostId, streamRef.current);
        setCurrentCall(call);
        call.on('stream', (remoteStream) => {
          setPartnerStream(remoteStream);
          setIsConnected(true);
          setConnectionStatusText('Connected to host!');
        });
      } else {
        const call = newPeer.call(hostId, new MediaStream());
        setCurrentCall(call);
        call.on('stream', (remoteStream) => {
          setPartnerStream(remoteStream);
          setIsConnected(true);
          setConnectionStatusText('Connected to host!');
        });
      }
    });

    newPeer.on('error', (err) => {
      console.error('Peer join error:', err);
      setConnectionStatusText('Failed to connect. Double check your code.');
    });
  };

  const setupDataConnection = (connection: any) => {
    connection.on('open', () => {
      setIsConnected(true);
    });

    connection.on('data', (data: any) => {
      if (data.type === 'START_COUNTDOWN') {
        setIsCapturing(true);
        setTempCapturedPhotos([]);
        setMyPhotos({});
        setPartnerPhotos({});
        setCountdown(data.countdownDuration);
        setCurrentCaptureStep(0);
      } else if (data.type === 'LOCAL_CAPTURE_READY') {
        setPartnerPhotos(prev => ({
          ...prev,
          [data.step]: data.photo
        }));
      } else if (data.type === 'RESET_SESSION') {
        setIsCapturing(false);
        setCurrentCaptureStep(-1);
        setTempCapturedPhotos([]);
        setMyPhotos({});
        setPartnerPhotos({});
      }
    });

    connection.on('close', () => {
      setIsConnected(false);
      setPartnerStream(null);
      setConnectionStatusText('Partner disconnected.');
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerIdCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // --- Capture sequence loop logic ---

  const startCaptureSequence = () => {
    if (!streamRef.current) return;
    
    if (isConnected && conn) {
      // Sync trigger to partner
      conn.send({
        type: 'START_COUNTDOWN',
        countdownDuration: countdownDuration
      });
    }

    setIsCapturing(true);
    setTempCapturedPhotos([]);
    setMyPhotos({});
    setPartnerPhotos({});
    setCountdown(countdownDuration);
    setCurrentCaptureStep(0);
  };

  // Loop control
  useEffect(() => {
    if (!isCapturing || currentCaptureStep < 0 || currentCaptureStep >= layout.photosCount) {
      if (isCapturing && currentCaptureStep === layout.photosCount) {
        setIsCapturing(false);
        setCurrentCaptureStep(-1);
        onPhotosCaptured(tempCapturedPhotos);
      }
      return;
    }

    let intervalId: any;
    if (countdown > 0) {
      intervalId = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else {
      captureSinglePhoto();
    }

    return () => clearInterval(intervalId);
  }, [isCapturing, currentCaptureStep, countdown]);

  const captureSinglePhoto = () => {
    if (!videoRef.current) return;

    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 500);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      if (isConnected && conn) {
        // Send frame to partner
        conn.send({
          type: 'LOCAL_CAPTURE_READY',
          photo: imgDataUrl,
          step: currentCaptureStep
        });
        // Save local photo
        setMyPhotos(prev => ({ ...prev, [currentCaptureStep]: imgDataUrl }));
      } else {
        // Single player mode path
        setTempCapturedPhotos(prev => [...prev, imgDataUrl]);
        setTimeout(() => {
          setCurrentCaptureStep(prev => prev + 1);
          setCountdown(countdownDuration);
        }, 800);
      }
    }
  };

  // Composite hook: Wait for both frames, merge and advance
  useEffect(() => {
    if (!isConnected || currentCaptureStep < 0 || currentCaptureStep >= layout.photosCount) return;

    const localPhoto = myPhotos[currentCaptureStep];
    const remotePhoto = partnerPhotos[currentCaptureStep];

    if (localPhoto && remotePhoto) {
      mergeAndAdvance(currentCaptureStep, localPhoto, remotePhoto);
    }
  }, [myPhotos, partnerPhotos, currentCaptureStep, isConnected]);

  const mergeAndAdvance = async (step: number, photo1: string, photo2: string) => {
    try {
      // Host is left half, Guest is right half
      const leftPhoto = isHost ? photo1 : photo2;
      const rightPhoto = isHost ? photo2 : photo1;

      const merged = await mergePhotosSideBySide(leftPhoto, rightPhoto, layout.aspectRatio);
      
      setTempCapturedPhotos(prev => [...prev, merged]);

      setTimeout(() => {
        setCurrentCaptureStep(prev => prev + 1);
        setCountdown(countdownDuration);
      }, 800);
    } catch (err) {
      console.error('Failed to merge partner photos:', err);
    }
  };

  const handleResetSession = () => {
    if (isConnected && conn) {
      conn.send({ type: 'RESET_SESSION' });
    }
    setIsCapturing(false);
    setCurrentCaptureStep(-1);
    setTempCapturedPhotos([]);
    setMyPhotos({});
    setPartnerPhotos({});
  };

  // --- Upload Mode ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    
    const readPromises = filesArray.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(base64Photos => {
      setUploadedPhotos(prev => {
        const total = [...prev, ...base64Photos].slice(0, layout.photosCount);
        return total;
      });
    });
  };

  const removeUploadedPhoto = (index: number) => {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const submitUploadedPhotos = () => {
    if (uploadedPhotos.length === layout.photosCount) {
      onPhotosUploaded(uploadedPhotos);
    }
  };

  useEffect(() => {
    setUploadedPhotos([]);
  }, [layout]);

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-3xl border border-stone-200/80 shadow-pinterest p-5 sm:p-6 overflow-hidden">
      {/* Modes Bar */}
      <div className="flex flex-wrap gap-2 mb-4 bg-stone-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => { setMode('camera'); startCamera(selectedDeviceId); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-sans font-medium rounded-xl transition-all ${
            mode === 'camera' && !coupleModeActive
              ? 'bg-white text-stone-900 shadow-sm' 
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Camera className="w-4 h-4" />
          Camera Feed
        </button>
        <button
          onClick={() => { 
            setMode('camera'); 
            setCoupleModeActive(true); 
            startCamera(selectedDeviceId);
          }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-sans font-medium rounded-xl transition-all ${
            mode === 'camera' && coupleModeActive
              ? 'bg-[#FFE4E6] text-rose-700 shadow-sm' 
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Couple Mode (P2P)
        </button>
        <button
          onClick={() => { setMode('upload'); setCoupleModeActive(false); stopCamera(); cleanupPeer(); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-sans font-medium rounded-xl transition-all ${
            mode === 'upload' 
              ? 'bg-white text-stone-900 shadow-sm' 
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload Images
        </button>
      </div>

      {/* Couple Mode Setup Panel */}
      {coupleModeActive && mode === 'camera' && !isConnected && (
        <div className="mb-4 bg-rose-50/50 border border-rose-100 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-rose-700 font-sans font-semibold text-sm">
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500 animate-pulse" />
            Connect with your Couple Booth partner
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Host Section */}
            <div className="bg-white border border-stone-200/60 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-stone-850 mb-1">Option A: Host Session</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed mb-3">
                  Generate a temporary room code to let your partner join your booth setup.
                </p>
              </div>
              {peerIdCode ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between bg-stone-50 border border-stone-200/80 px-3 py-2 rounded-lg">
                    <span className="text-sm font-extrabold tracking-widest text-stone-850 font-mono">{peerIdCode}</span>
                    <button 
                      onClick={copyToClipboard}
                      className="text-stone-500 hover:text-stone-900 p-1 flex items-center gap-1 text-[10px]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedCode ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCreateSession}
                  className="bg-stone-900 hover:bg-stone-800 text-white font-sans text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Generate Code
                </button>
              )}
            </div>

            {/* Join Section */}
            <div className="bg-white border border-stone-200/60 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-stone-850 mb-1">Option B: Join Session</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed mb-3">
                  Enter your partner's 6-digit session code to establish WebRTC connection.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6 digits"
                  className="text-xs border border-stone-200 rounded-lg px-2.5 py-2 outline-none font-sans font-medium text-stone-700 w-full"
                />
                <button
                  onClick={handleJoinSession}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-sans text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
          {connectionStatusText && (
            <div className="text-[11px] text-stone-500 font-sans mt-1 bg-white/40 px-2 py-1 rounded w-fit">
              {connectionStatusText}
            </div>
          )}
        </div>
      )}

      {/* Connected Partner Panel */}
      {coupleModeActive && isConnected && (
        <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center justify-between text-xs font-sans text-emerald-850">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected! Live Couple Camera Sync is Active.</span>
          </div>
          <button 
            onClick={cleanupPeer}
            className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-800 bg-white border border-stone-200/80 px-2.5 py-1 rounded-lg"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      )}

      {mode === 'camera' ? (
        <div className="flex flex-col gap-4">
          {/* Camera Viewport Screen */}
          <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-stone-950 border border-stone-200 shadow-inner">
            {permissionState === 'checking' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
                <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                <p className="text-sm font-sans">Checking camera permissions...</p>
              </div>
            )}

            {permissionState === 'denied' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-stone-400 bg-stone-900">
                <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
                <p className="text-sm text-stone-200 font-sans mb-1">Camera Access Blocked</p>
                <p className="text-xs text-stone-400 font-sans max-w-xs">{errorMsg}</p>
              </div>
            )}

            {permissionState === 'granted' && (
              <div className="w-full h-full relative">
                <div className={`w-full h-full bg-stone-900 p-1.5 ${
                  coupleModeActive && isConnected 
                    ? 'grid grid-cols-2 gap-1.5' 
                    : 'block'
                }`}>
                  {/* Left/Main screen: Local user */}
                  <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950 border border-stone-800">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    {coupleModeActive && isConnected && (
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white font-sans">
                        You
                      </div>
                    )}
                  </div>
                  
                  {/* Right screen: Remote partner */}
                  {coupleModeActive && isConnected && (
                    <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950 border border-stone-800">
                      <video
                        ref={partnerVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-rose-300 font-sans flex items-center gap-1">
                        <Heart className="w-3 h-3 fill-rose-500 text-rose-500 animate-pulse" />
                        Partner
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Flash Effect Layer */}
            <AnimatePresence>
              {flashActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 bg-white z-20 pointer-events-none"
                />
              )}
            </AnimatePresence>

            {/* Countdown Overlay */}
            <AnimatePresence>
              {isCapturing && countdown > 0 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1.1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  key={countdown}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 z-10 pointer-events-none"
                >
                  <span className="text-white font-extrabold text-7xl sm:text-9xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] font-sans">
                    {countdown}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Capture Progress HUD Overlay */}
            {isCapturing && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white text-xs sm:text-sm font-sans flex items-center gap-3 z-10">
                <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                <span>Taking photo {currentCaptureStep + 1} of {layout.photosCount}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              </div>
            )}
          </div>

          {/* Camera controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mt-2">
            {devices.length > 1 && !isConnected ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-stone-500 font-sans whitespace-nowrap">Camera:</span>
                <select
                  value={selectedDeviceId}
                  onChange={handleDeviceChange}
                  className="text-xs bg-stone-100 border border-stone-200/80 rounded-lg px-2.5 py-1.5 outline-none font-sans text-stone-700 w-full sm:w-48"
                  disabled={isCapturing}
                >
                  {devices.map((device, idx) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : <div />}

            <div className="flex gap-2 w-full sm:w-auto">
              {isCapturing && (
                <button
                  onClick={handleResetSession}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-850 text-xs sm:text-sm px-4 py-3 rounded-full flex items-center justify-center font-sans font-semibold transition-all border border-stone-200/60"
                >
                  Cancel
                </button>
              )}
              
              <button
                onClick={startCaptureSequence}
                disabled={isCapturing || permissionState !== 'granted' || (coupleModeActive && !isConnected)}
                className="w-full sm:w-auto bg-stone-900 hover:bg-stone-800 disabled:bg-stone-350 disabled:text-stone-500 disabled:cursor-not-allowed text-white font-sans font-medium text-sm sm:text-base px-8 py-3 rounded-full flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                {isCapturing 
                  ? 'Capturing...' 
                  : (coupleModeActive && !isConnected) 
                    ? 'Wait for connection' 
                    : 'Start Session'
                }
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Upload Mode Workspace */
        <div className="flex flex-col gap-4">
          <div className="border-2 border-dashed border-stone-200 bg-stone-50/50 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-stone-50 transition-all relative">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploadedPhotos.length >= layout.photosCount}
            />
            <Upload className="w-8 h-8 text-stone-400 mb-3" />
            <h3 className="text-sm font-sans font-semibold text-stone-800 mb-1">Upload files</h3>
            <p className="text-xs text-stone-500 font-sans max-w-sm mb-2">
              Select {layout.photosCount} files matching your layout. Add images that you want to stack.
            </p>
            <p className="text-[10px] text-stone-400 font-sans bg-stone-100 border border-stone-200/80 px-2 py-0.5 rounded">
              PNG, JPG, or WEBP supported
            </p>
          </div>

          {/* Grid showing uploaded images */}
          {uploadedPhotos.length > 0 && (
            <div className="bg-stone-50/50 rounded-2xl p-4 border border-stone-200/60">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-sans font-medium text-stone-500">
                  Uploaded {uploadedPhotos.length} of {layout.photosCount}
                </span>
                {uploadedPhotos.length === layout.photosCount && (
                  <span className="text-xs text-emerald-600 font-sans font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Ready
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3">
                {uploadedPhotos.map((photo, index) => (
                  <div key={index} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-stone-200 group bg-stone-200">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeUploadedPhoto(index)}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 hover:scale-105 rounded-full p-1 text-white opacity-90 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/40 px-1.5 py-0.5 rounded text-[8px] text-white">
                      #{index + 1}
                    </div>
                  </div>
                ))}
                
                {/* Empty placeholders */}
                {Array.from({ length: Math.max(0, layout.photosCount - uploadedPhotos.length) }).map((_, idx) => (
                  <div key={idx} className="aspect-[3/4] rounded-lg border border-dashed border-stone-200 flex items-center justify-center text-stone-300 text-xs">
                    Slot {uploadedPhotos.length + idx + 1}
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={submitUploadedPhotos}
                  disabled={uploadedPhotos.length < layout.photosCount}
                  className="bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-sans font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-full flex items-center gap-2 transition-all shadow-sm"
                >
                  Create Photo Strip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
