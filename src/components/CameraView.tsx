import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
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

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: ['stun:global.stun.twilio.com:3478'] },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  }
};

// Robust local video component that guarantees the stream is bound to the DOM
const LocalVideo = forwardRef<HTMLVideoElement, { stream: MediaStream | null, label?: React.ReactNode }>(({ stream, label }, ref) => {
  const localRef = useRef<HTMLVideoElement>(null);
  
  useImperativeHandle(ref, () => localRef.current as HTMLVideoElement);
  
  useEffect(() => {
    if (localRef.current && stream) {
      localRef.current.srcObject = stream;
      localRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950 flex items-center justify-center">
      {!stream ? (
        <div className="flex flex-col items-center gap-2 text-stone-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-[10px] font-sans">Waiting for camera...</span>
        </div>
      ) : (
        <>
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          {label && (
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white font-sans flex items-center gap-1">
              {label}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export const CameraView: React.FC<CameraViewProps> = ({
  layout,
  onPhotosCaptured,
  onPhotosUploaded,
  countdownDuration
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connRef = useRef<any>(null);
  const frameIntervalRef = useRef<any>(null);
  
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
  const [peerIdCode, setPeerIdCode] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [connectionStatusText, setConnectionStatusText] = useState<string>('');

  // Partner frame preview (received via data channel)
  const [partnerFrame, setPartnerFrame] = useState<string>('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Dual photo store for merging
  const [myPhotos, setMyPhotos] = useState<{ [key: number]: string }>({});
  const [partnerPhotos, setPartnerPhotos] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    checkPermissionsAndDevices();
    return () => {
      stopCamera();
      cleanupPeer();
    };
  }, []);

  useEffect(() => {
    connRef.current = conn;
  }, [conn]);

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
      stream.getTracks().forEach(track => track.stop());
      
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
      setLocalStream(stream);
      setPermissionState('granted');
    } catch (err: any) {
      console.error('Error starting camera:', err);
      setErrorMsg('Error opening camera stream.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setLocalStream(null);
    }
  };

  const cleanupPeer = () => {
    stopFrameStreaming();
    if (conn) conn.close();
    if (peer) peer.destroy();
    setPeer(null);
    setConn(null);
    connRef.current = null;
    setIsConnected(false);
    setPartnerFrame('');
    setMyPhotos({});
    setPartnerPhotos({});
    setPeerIdCode('');
    setConnectionStatusText('');
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    startCamera(newId);
  };

  // --- Frame streaming over data channel (Replaces WebRTC Media Streams) ---
  
  const startFrameStreaming = (connection: any) => {
    stopFrameStreaming();
    
    frameIntervalRef.current = setInterval(() => {
      const activeConn = connRef.current || connection;
      if (!activeConn || !activeConn.open) return;

      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Mirror the frame so it looks correct to the partner
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = canvas.toDataURL('image/jpeg', 0.4);
      
      try {
        activeConn.send({ type: 'FRAME', data: frame });
      } catch (e) {
        console.error('Failed to send frame', e);
      }
    }, 250); // 4fps preview
  };

  const stopFrameStreaming = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  };

  // --- Couple Session Handlers ---

  const handleCreateSession = () => {
    cleanupPeer();
    setConnectionStatusText('Generating session code...');
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const peerId = `pb-${randomCode}`;

    const newPeer = new Peer(peerId, PEER_CONFIG);

    newPeer.on('open', () => {
      setPeer(newPeer);
      setPeerIdCode(randomCode);
      setIsHost(true);
      setConnectionStatusText('Waiting for partner to join...');
    });

    newPeer.on('error', (err) => {
      console.error('Peer creation error:', err);
      setConnectionStatusText(`Error: ${err.type} - ${err.message}`);
    });

    newPeer.on('connection', (connection) => {
      console.log('[Host] Partner connected via data channel');
      setConn(connection);
      connRef.current = connection;
      setupDataConnection(connection);
    });
  };

  const handleJoinSession = () => {
    if (!joinCodeInput || joinCodeInput.length !== 6) {
      setConnectionStatusText('Please enter a valid 6-digit code.');
      return;
    }
    
    cleanupPeer();
    setConnectionStatusText('Connecting to session...');
    
    const newPeer = new Peer(PEER_CONFIG);
    
    newPeer.on('open', () => {
      setPeer(newPeer);
      setIsHost(false);
      
      const hostId = `pb-${joinCodeInput}`;
      console.log('[Guest] Connecting to host:', hostId);
      
      const connection = newPeer.connect(hostId, { reliable: true });
      setConn(connection);
      connRef.current = connection;
      setupDataConnection(connection);

      // Connection timeout safeguard
      let isOpened = false;
      connection.on('open', () => { isOpened = true; });
      setTimeout(() => {
        if (!isOpened) {
          setConnectionStatusText('Connection timed out. strict NAT/Firewall blocking WebRTC.');
        }
      }, 12000);
    });

    newPeer.on('error', (err) => {
      console.error('Peer join error:', err);
      setConnectionStatusText(`Failed: ${err.type} - ${err.message}`);
    });
  };

  const setupDataConnection = (connection: any) => {
    connection.on('open', () => {
      console.log('[P2P] Data channel OPEN - starting frame streaming');
      setIsConnected(true);
      setConnectionStatusText('Connected! Live preview active.');
      
      startFrameStreaming(connection);
    });

    connection.on('data', (data: any) => {
      if (data.type === 'FRAME') {
        setPartnerFrame(data.data);
      } else if (data.type === 'START_COUNTDOWN') {
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
      console.log('[P2P] Data channel closed');
      stopFrameStreaming();
      setIsConnected(false);
      setPartnerFrame('');
      setConnectionStatusText('Partner disconnected.');
    });

    connection.on('error', (err: any) => {
      console.error('[P2P] Data channel error:', err);
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
    
    const activeConn = connRef.current;
    if (isConnected && activeConn) {
      activeConn.send({
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
      
      const activeConn = connRef.current;
      if (isConnected && activeConn) {
        // Send full-res capture to partner
        activeConn.send({
          type: 'LOCAL_CAPTURE_READY',
          photo: imgDataUrl,
          step: currentCaptureStep
        });
        setMyPhotos(prev => ({ ...prev, [currentCaptureStep]: imgDataUrl }));
      } else {
        setTempCapturedPhotos(prev => [...prev, imgDataUrl]);
        setTimeout(() => {
          setCurrentCaptureStep(prev => prev + 1);
          setCountdown(countdownDuration);
        }, 800);
      }
    }
  };

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
    const activeConn = connRef.current;
    if (isConnected && activeConn) {
      activeConn.send({ type: 'RESET_SESSION' });
    }
    setIsCapturing(false);
    setCurrentCaptureStep(-1);
    setTempCapturedPhotos([]);
    setMyPhotos({});
    setPartnerPhotos({});
  };

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
          onClick={() => { setMode('camera'); setCoupleModeActive(false); cleanupPeer(); startCamera(selectedDeviceId); }}
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
          Couple Mode
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

      {coupleModeActive && mode === 'camera' && !isConnected && (
        <div className="mb-4 bg-rose-50/50 border border-rose-100 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-rose-700 font-sans font-semibold text-sm">
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500 animate-pulse" />
            Connect with your partner
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-stone-200/60 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-stone-850 mb-1">Option A: Host Session</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed mb-3">
                  Generate a code and share it with your partner.
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
                  disabled={permissionState !== 'granted'}
                  className="bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-sans text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all w-full"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Generate Code
                </button>
              )}
            </div>

            <div className="bg-white border border-stone-200/60 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-stone-850 mb-1">Option B: Join Session</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed mb-3">
                  Enter your partner's 6-digit session code.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6 digits"
                  disabled={permissionState !== 'granted'}
                  className="text-xs border border-stone-200 rounded-lg px-2.5 py-2 outline-none font-sans font-medium text-stone-700 w-full disabled:bg-stone-50"
                />
                <button
                  onClick={handleJoinSession}
                  disabled={permissionState !== 'granted' || joinCodeInput.length !== 6}
                  className="bg-rose-600 hover:bg-rose-500 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-sans text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap"
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

      {coupleModeActive && isConnected && (
        <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center justify-between text-xs font-sans text-emerald-850">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected! Live Data-Channel preview is Active.</span>
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
                <div className={`w-full h-full bg-stone-900 ${
                  coupleModeActive && isConnected 
                    ? 'grid grid-cols-2 gap-1 p-1' 
                    : 'block'
                }`}>
                  {/* Left/Main screen: Local user camera */}
                  <LocalVideo 
                    ref={videoRef} 
                    stream={localStream} 
                    label={coupleModeActive && isConnected ? "You" : undefined}
                  />
                  
                  {/* Right screen: Partner video preview (Frames over Data Channel) */}
                  {coupleModeActive && isConnected && (
                    <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950 flex items-center justify-center">
                      {partnerFrame ? (
                        <img src={partnerFrame} alt="Partner preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-stone-500">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span className="text-[10px] font-sans">Receiving frames...</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white font-sans flex items-center gap-1">
                        <Heart className="w-3 h-3 fill-rose-500 text-rose-500 animate-pulse" />
                        Partner
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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

            {isCapturing && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white text-xs sm:text-sm font-sans flex items-center gap-3 z-10">
                <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                <span>Taking photo {currentCaptureStep + 1} of {layout.photosCount}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              </div>
            )}
          </div>

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
              Select {layout.photosCount} files matching your layout.
            </p>
          </div>

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
                      className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 rounded-full p-1 text-white opacity-90 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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
