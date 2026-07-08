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

type DebugEntry = {
  id: number;
  time: string;
  section: string;
  message: string;
};

type WebRtcStatus = {
  role: 'host' | 'guest' | '';
  peerState: string;
  dataState: string;
  mediaState: string;
  iceState: string;
  signalingState: string;
  connectionState: string;
  lastEvent: string;
};

// Fallback STUN-only config, used if fetching TURN credentials fails.
// STUN alone works fine on open networks but will NOT get you through a
// symmetric NAT/restrictive firewall — that's what TURN is for.
const STUN_ONLY_FALLBACK = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:global.stun.twilio.com:3478'] }
  ]
};

// Your Metered.ca app subdomain, e.g. if your dashboard URL is
// https://yourappname.metered.live, set VITE_METERED_APP_NAME=yourappname
// in a .env file at your project root (Vite exposes it via import.meta.env).
const METERED_APP_NAME = import.meta.env.VITE_METERED_APP_NAME as string | undefined;
// Your Metered.ca API key, from Dashboard -> your app -> API Key.
// Sign up free at https://www.metered.ca/stun-turn — no credit card required,
// 500MB/month free TURN relay usage.
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY as string | undefined;

// Fetches fresh, working TURN credentials from your Metered account instead
// of relying on the old openrelay.metered.ca static demo credentials, which
// are now rejected server-side (that's the errorCode 701 you were seeing).
// Falls back to STUN-only (no TURN) if no API key is configured or the
// fetch fails, so the app still works on friendly networks either way.
async function getIceServers(): Promise<RTCIceServer[]> {
  if (!METERED_APP_NAME || !METERED_API_KEY) {
    console.warn(
      'No Metered TURN credentials configured (VITE_METERED_APP_NAME / VITE_METERED_API_KEY). ' +
      'Falling back to STUN-only, which will fail on restrictive networks. ' +
      'Sign up free at https://www.metered.ca/stun-turn to fix this.'
    );
    return STUN_ONLY_FALLBACK.iceServers;
  }

  try {
    const response = await fetch(
      `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
    );
    if (!response.ok) throw new Error(`Metered credentials request failed: ${response.status}`);
    const iceServers: RTCIceServer[] = await response.json();
    return [...STUN_ONLY_FALLBACK.iceServers, ...iceServers];
  } catch (err) {
    console.warn('Failed to fetch Metered TURN credentials, falling back to STUN-only:', err);
    return STUN_ONLY_FALLBACK.iceServers;
  }
}

// debug: 3 enables verbose PeerJS/WebRTC logging to the console.
const PEER_DEBUG_LEVEL = 3;

// How long to wait for the data channel to open before declaring a timeout.
// TURN relay negotiation on a slow/restrictive network can take longer than
// the previous 15s allowed, producing false-negative timeouts.
const CONNECTION_TIMEOUT_MS = 25000;

// Robust Video Component that guarantees stream is bound to the DOM element regardless of React renders
const RobustVideo = forwardRef<HTMLVideoElement, { stream: MediaStream | null, label?: React.ReactNode, isMirrored?: boolean }>(({ stream, label, isMirrored = true }, ref) => {
  const localRef = useRef<HTMLVideoElement>(null);
  
  useImperativeHandle(ref, () => localRef.current as HTMLVideoElement);
  
  useEffect(() => {
    if (localRef.current && stream) {
      localRef.current.srcObject = stream;
      localRef.current.play().catch(e => console.warn('Video play prevented:', e));
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden bg-stone-950 flex items-center justify-center">
      {!stream ? (
        <div className="flex flex-col items-center gap-2 text-stone-500 p-4 text-center">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-[10px] font-sans">Connecting video stream...</span>
        </div>
      ) : (
        <>
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
          />
          {label && (
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white font-sans flex items-center gap-1 z-10">
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
  
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [currentCaptureStep, setCurrentCaptureStep] = useState<number>(-1);
  const [countdown, setCountdown] = useState<number>(0);
  const [tempCapturedPhotos, setTempCapturedPhotos] = useState<string[]>([]);
  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);

  // Couple Mode states
  const [coupleModeActive, setCoupleModeActive] = useState<boolean>(false);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [conn, setConn] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [peerIdCode, setPeerIdCode] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [connectionStatusText, setConnectionStatusText] = useState<string>('');
  const [webRtcStatus, setWebRtcStatus] = useState<WebRtcStatus>({
    role: '',
    peerState: 'idle',
    dataState: 'idle',
    mediaState: 'idle',
    iceState: 'idle',
    signalingState: 'idle',
    connectionState: 'idle',
    lastEvent: 'Waiting for session start'
  });

  // Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [partnerStream, setPartnerStream] = useState<MediaStream | null>(null);

  // Photos
  const [myPhotos, setMyPhotos] = useState<{ [key: number]: string }>({});
  const [partnerPhotos, setPartnerPhotos] = useState<{ [key: number]: string }>({});
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const debugIdRef = useRef(0);

  const isInstagramBrowser = typeof navigator !== 'undefined' && navigator.userAgent.includes('Instagram');

  const logDebug = (section: string, message: string, details?: unknown) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const detailSuffix = details !== undefined ? ` | ${typeof details === 'string' ? details : JSON.stringify(details)}` : '';
    const entry = {
      id: ++debugIdRef.current,
      time,
      section,
      message: `${message}${detailSuffix}`
    };

    console.log(`[${section}] ${message}`, details ?? '');
    setDebugEntries(prev => [entry, ...prev].slice(0, 20));
  };

  const summarizeStream = (stream: MediaStream | null) => {
    if (!stream) return 'no stream';

    return {
      id: stream.id,
      active: stream.active,
      tracks: stream.getTracks().map(track => ({
        kind: track.kind,
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      }))
    };
  };

  const updateWebRtcStatus = (patch: Partial<WebRtcStatus>) => {
    setWebRtcStatus(prev => ({ ...prev, ...patch }));
  };

  const attachPeerConnectionDebug = (peerConnection: RTCPeerConnection | null | undefined, role: 'host' | 'guest') => {
    if (!peerConnection) return;

    updateWebRtcStatus({
      role,
      mediaState: 'call-attached',
      iceState: peerConnection.iceConnectionState,
      signalingState: peerConnection.signalingState,
      connectionState: peerConnection.connectionState,
      lastEvent: `${role} peer connection attached`
    });

    peerConnection.oniceconnectionstatechange = () => {
      updateWebRtcStatus({
        role,
        iceState: peerConnection.iceConnectionState,
        lastEvent: `${role} ICE -> ${peerConnection.iceConnectionState}`
      });
      logDebug('webrtc', `${role} ICE state changed`, { iceConnectionState: peerConnection.iceConnectionState });
    };

    peerConnection.onsignalingstatechange = () => {
      updateWebRtcStatus({
        role,
        signalingState: peerConnection.signalingState,
        lastEvent: `${role} signaling -> ${peerConnection.signalingState}`
      });
      logDebug('webrtc', `${role} signaling state changed`, { signalingState: peerConnection.signalingState });
    };

    peerConnection.onconnectionstatechange = () => {
      updateWebRtcStatus({
        role,
        connectionState: peerConnection.connectionState,
        lastEvent: `${role} connection -> ${peerConnection.connectionState}`
      });
      logDebug('webrtc', `${role} connection state changed`, { connectionState: peerConnection.connectionState });
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      updateWebRtcStatus({
        role,
        mediaState: 'remote-track-received',
        lastEvent: `${role} track received: ${event.track?.kind}`
      });
      logDebug('webrtc', `${role} received track event`, {
        trackKind: event.track?.kind,
        trackId: event.track?.id,
        streams: event.streams?.map(s => s.id)
      });
    };

    // Surfaces exactly which STUN/TURN server failed and why (e.g. TURN auth
    // rejected, TURN unreachable, STUN timeout). Without this, "ICE failed"
    // gives no clue whether it's a bad relay, blocked ports, or something
    // else — this is the missing piece for diagnosing NAT traversal issues.
    peerConnection.onicecandidateerror = (event: any) => {
      logDebug('webrtc', `${role} ICE candidate error`, {
        address: event.address,
        port: event.port,
        url: event.url,
        errorCode: event.errorCode,
        errorText: event.errorText
      });
    };

  };

  useEffect(() => {
    logDebug('lifecycle', 'Component mounted and camera/device check started');
    checkPermissionsAndDevices();
    return () => {
      stopCamera(true);
      cleanupPeer(true);
    };
  }, []);

  useEffect(() => {
    connRef.current = conn;
  }, [conn]);

  const checkPermissionsAndDevices = async () => {
    logDebug('camera', 'Checking media device support');
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setPermissionState('denied');
      setErrorMsg('Webcam API is not supported by your browser.');
      setMode('upload');
      logDebug('camera', 'MediaDevices API not supported in this browser');
      return;
    }

    try {
      setPermissionState('checking');
      logDebug('camera', 'Enumerating video input devices');
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devList.filter(d => d.kind === 'videoinput');
      setDevices(videoDevs);
      logDebug('camera', 'Video devices found', { count: videoDevs.length, deviceIds: videoDevs.map(d => d.deviceId) });
      
      if (videoDevs.length > 0) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }

      logDebug('camera', 'Requesting temporary camera access to validate permissions');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      logDebug('camera', 'Temporary camera stream acquired', summarizeStream(stream));
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionState('granted');
      logDebug('camera', 'Camera permissions granted; starting active preview');
      startCamera(videoDevs[0]?.deviceId || '');
    } catch (err: any) {
      console.error('Camera permission check failed:', err);
      logDebug('camera', 'Camera permission check failed', { name: err?.name, message: err?.message });
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
    logDebug('camera', 'Starting camera stream', { deviceId: deviceId || 'default' });
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
      logDebug('camera', 'Active camera stream ready', summarizeStream(stream));
      
      // If we change camera during an active call, seamlessly replace the video track
      if (currentCall && isConnected) {
        const videoTrack = stream.getVideoTracks()[0];
        const sender = currentCall.peerConnection?.getSenders().find((s: any) => s.track?.kind === 'video');
        if (sender && videoTrack) {
          logDebug('webrtc', 'Replacing outgoing video track after camera change');
          sender.replaceTrack(videoTrack).catch(console.error);
        }
      }
    } catch (err: any) {
      console.error('Error starting camera:', err);
      logDebug('camera', 'Error starting camera stream', { name: err?.name, message: err?.message, constraints });
      setErrorMsg('Error opening camera stream.');
    }
  };

  const stopCamera = (silent = false) => {
    if (streamRef.current) {
      if (!silent) {
        logDebug('camera', 'Stopping active camera stream', summarizeStream(streamRef.current));
      }
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setLocalStream(null);
    }
  };

  const cleanupPeer = (silent = false) => {
    if (!silent) {
      logDebug('webrtc', 'Cleaning up peer/session resources');
    }
    if (currentCall) currentCall.close();
    if (conn) conn.close();
    if (peer) peer.destroy();
    setPeer(null);
    setConn(null);
    setCurrentCall(null);
    connRef.current = null;
    setIsConnected(false);
    setPartnerStream(null);
    setMyPhotos({});
    setPartnerPhotos({});
    setPeerIdCode('');
    setConnectionStatusText('');
    updateWebRtcStatus({
      role: '',
      peerState: 'idle',
      dataState: 'idle',
      mediaState: 'idle',
      iceState: 'idle',
      signalingState: 'idle',
      connectionState: 'idle',
      lastEvent: 'Session cleaned up'
    });
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    startCamera(newId);
  };

  // --- Couple Session Handlers (WebRTC Data + Media Streams) ---

  const handleCreateSession = async () => {
    logDebug('webrtc', 'Host session creation requested');
    cleanupPeer();
    setConnectionStatusText('Generating session code...');
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const peerId = `pb-${randomCode}`;

    const iceServers = await getIceServers();
    logDebug('webrtc', 'Host fetched ICE servers', { count: iceServers.length });
    const newPeer = new Peer(peerId, { debug: PEER_DEBUG_LEVEL, config: { iceServers } });
    logDebug('webrtc', 'Host peer object created', { peerId });

    newPeer.on('open', () => {
      setPeer(newPeer);
      setPeerIdCode(randomCode);
      setIsHost(true);
      setConnectionStatusText('Waiting for partner to join...');
      updateWebRtcStatus({
        role: 'host',
        peerState: 'open',
        lastEvent: 'Host peer open'
      });
      logDebug('webrtc', 'Host peer open and ready', { peerId });
    });

    newPeer.on('error', (err) => {
      console.error('Peer creation error:', err);
      updateWebRtcStatus({
        role: 'host',
        peerState: 'error',
        lastEvent: `Host peer error: ${err?.type || 'unknown'}`
      });
      logDebug('webrtc', 'Host peer error', { type: err?.type, message: err?.message });
      setConnectionStatusText(`Error: ${err.type} - ${err.message}`);
    });

    // 1. Listen for incoming data channel
    newPeer.on('connection', (connection) => {
      console.log('[Host] Partner connected via data channel');
      logDebug('webrtc', 'Host received incoming data connection');
      setConn(connection);
      connRef.current = connection;
      setupDataConnection(connection);
    });

    // 2. Listen for incoming video call
    newPeer.on('call', (call) => {
      console.log('[Host] Incoming call. Replying with stream.');
      logDebug('webrtc', 'Host received incoming media call', summarizeStream(streamRef.current));
      const outStream = streamRef.current || new MediaStream();
      call.answer(outStream);
      setCurrentCall(call);
      attachPeerConnectionDebug(call.peerConnection, 'host');

      call.on('stream', (remoteStream) => {
        console.log('[Host] Received partner video stream');
        logDebug('webrtc', 'Host received partner remote stream', summarizeStream(remoteStream));
        updateWebRtcStatus({
          role: 'host',
          mediaState: 'remote-stream-received',
          lastEvent: 'Host remote stream received'
        });
        setPartnerStream(remoteStream);
      });

      call.on('error', (err: any) => {
        updateWebRtcStatus({
          role: 'host',
          mediaState: 'error',
          lastEvent: `Host media error: ${err?.type || 'unknown'}`
        });
        logDebug('webrtc', 'Host media call error', { type: err?.type, message: err?.message });
      });
      
      call.on('close', () => {
        updateWebRtcStatus({
          role: 'host',
          mediaState: 'closed',
          lastEvent: 'Host media call closed'
        });
        logDebug('webrtc', 'Host media call closed');
        setPartnerStream(null);
      });
    });
  };

  const handleJoinSession = async () => {
    logDebug('webrtc', 'Join session requested', { joinCodeInput });
    if (!joinCodeInput || joinCodeInput.length !== 6) {
      setConnectionStatusText('Please enter a valid 6-digit code.');
      logDebug('webrtc', 'Join aborted due to invalid code length');
      return;
    }
    
    cleanupPeer();
    setConnectionStatusText('Connecting to session...');
    
    const iceServers = await getIceServers();
    logDebug('webrtc', 'Guest fetched ICE servers', { count: iceServers.length });
    const newPeer = new Peer(undefined, { debug: PEER_DEBUG_LEVEL, config: { iceServers } });
    logDebug('webrtc', 'Guest peer object created with options');
    
    newPeer.on('open', () => {
      setPeer(newPeer);
      setIsHost(false);
      updateWebRtcStatus({
        role: 'guest',
        peerState: 'open',
        lastEvent: 'Guest peer open'
      });
      logDebug('webrtc', 'Guest peer open and ready');
      
      const hostId = `pb-${joinCodeInput}`;
      console.log('[Guest] Connecting to host:', hostId);
      logDebug('webrtc', 'Guest connecting to host', { hostId });
      
      // 1. Establish Data Channel (with TCP reliable mode for strict NATs)
      const connection = newPeer.connect(hostId, { reliable: true });
      setConn(connection);
      connRef.current = connection;
      setupDataConnection(connection);
      connection.on('error', (err: any) => {
        updateWebRtcStatus({
          role: 'guest',
          dataState: 'error',
          lastEvent: `Guest data error: ${err?.type || 'unknown'}`
        });
        logDebug('webrtc', 'Guest data connection error', { type: err?.type, message: err?.message });
      });

      // 2. Initiate Video Call
      const outStream = streamRef.current || new MediaStream();
      console.log('[Guest] Calling host with stream.');
      logDebug('webrtc', 'Guest placing media call', summarizeStream(outStream));
      const call = newPeer.call(hostId, outStream);
      setCurrentCall(call);
      attachPeerConnectionDebug(call.peerConnection, 'guest');

      call.on('stream', (remoteStream) => {
        console.log('[Guest] Received host video stream');
        logDebug('webrtc', 'Guest received host remote stream', summarizeStream(remoteStream));
        updateWebRtcStatus({
          role: 'guest',
          mediaState: 'remote-stream-received',
          lastEvent: 'Guest remote stream received'
        });
        setPartnerStream(remoteStream);
      });

      call.on('error', (err: any) => {
        updateWebRtcStatus({
          role: 'guest',
          mediaState: 'error',
          lastEvent: `Guest media error: ${err?.type || 'unknown'}`
        });
        logDebug('webrtc', 'Guest media call error', { type: err?.type, message: err?.message });
      });
      
      call.on('close', () => {
        updateWebRtcStatus({
          role: 'guest',
          mediaState: 'closed',
          lastEvent: 'Guest media call closed'
        });
        logDebug('webrtc', 'Guest media call closed');
        setPartnerStream(null);
      });

      // Timeout safeguard
      let isOpened = false;
      connection.on('open', () => {
        isOpened = true;
        updateWebRtcStatus({
          role: 'guest',
          dataState: 'open',
          lastEvent: 'Guest data channel open'
        });
        logDebug('webrtc', 'Guest data connection open');
      });
      setTimeout(() => {
        if (!isOpened) {
          setConnectionStatusText('Connection timed out. WebRTC signaling or NAT traversal did not complete. Check host code, network restrictions, VPN, or TURN availability.');
          updateWebRtcStatus({
            role: 'guest',
            dataState: 'timeout',
            lastEvent: 'Guest timeout waiting for data channel open'
          });
          logDebug('webrtc', `Guest connection timeout after ${CONNECTION_TIMEOUT_MS / 1000} seconds`, {
            hostId,
            note: 'Data connection did not open; this can be caused by blocked WebRTC traffic, unavailable host, or failing TURN relay. Check the ICE candidate error entries above for the specific cause.'
          });
        }
      }, CONNECTION_TIMEOUT_MS);
    });

    newPeer.on('error', (err) => {
      console.error('Peer join error:', err);
      updateWebRtcStatus({
        role: 'guest',
        peerState: 'error',
        lastEvent: `Guest peer error: ${err?.type || 'unknown'}`
      });
      logDebug('webrtc', 'Guest peer error', { type: err?.type, message: err?.message });
      setConnectionStatusText(`Failed: ${err.type} - ${err.message}`);
    });
  };

  const setupDataConnection = (connection: any) => {
    logDebug('webrtc', 'Configuring data connection listeners');
    connection.on('open', () => {
      console.log('[P2P] Data channel OPEN');
      updateWebRtcStatus({
        dataState: 'open',
        lastEvent: 'Data channel open'
      });
      logDebug('webrtc', 'Data channel open');
      setIsConnected(true);
      setConnectionStatusText('Connected! Live WebRTC preview active.');
    });

    connection.on('data', (data: any) => {
      if (data.type === 'START_COUNTDOWN') {
        setIsCapturing(true);
        setTempCapturedPhotos([]);
        setMyPhotos({});
        setPartnerPhotos({});
        setCountdown(data.countdownDuration);
        setCurrentCaptureStep(0);
        logDebug('capture', 'Received countdown start over data channel', data);
      } else if (data.type === 'LOCAL_CAPTURE_READY') {
        setPartnerPhotos(prev => ({
          ...prev,
          [data.step]: data.photo
        }));
        logDebug('capture', 'Received partner photo for step', { step: data.step });
      } else if (data.type === 'RESET_SESSION') {
        setIsCapturing(false);
        setCurrentCaptureStep(-1);
        setTempCapturedPhotos([]);
        setMyPhotos({});
        setPartnerPhotos({});
        logDebug('capture', 'Reset session received over data channel');
      }
    });

    connection.on('close', () => {
      console.log('[P2P] Data channel closed');
      updateWebRtcStatus({
        dataState: 'closed',
        lastEvent: 'Data channel closed'
      });
      logDebug('webrtc', 'Data channel closed');
      setIsConnected(false);
      setPartnerStream(null);
      setConnectionStatusText('Partner disconnected.');
    });

    connection.on('error', (err: any) => {
      updateWebRtcStatus({
        dataState: 'error',
        lastEvent: `Data connection error: ${err?.type || 'unknown'}`
      });
      logDebug('webrtc', 'Data connection error', { type: err?.type, message: err?.message });
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerIdCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // --- Capture logic ---

  const startCaptureSequence = () => {
    if (!streamRef.current) return;
    logDebug('capture', 'Capture sequence started', { layoutPhotos: layout.photosCount, countdownDuration });
    
    const activeConn = connRef.current;
    if (isConnected && activeConn) {
      activeConn.send({
        type: 'START_COUNTDOWN',
        countdownDuration: countdownDuration
      });
      logDebug('capture', 'Sent countdown start to partner');
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

    logDebug('capture', 'Capturing photo at step', { currentCaptureStep, hasRemote: isConnected });
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
        // Send high-res capture to partner via robust data channel
        activeConn.send({
          type: 'LOCAL_CAPTURE_READY',
          photo: imgDataUrl,
          step: currentCaptureStep
        });
        logDebug('capture', 'Sent local capture to partner', { step: currentCaptureStep });
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
      logDebug('capture', 'Merging photos for step', { step, isHost });
      const leftPhoto = isHost ? photo1 : photo2;
      const rightPhoto = isHost ? photo2 : photo1;

      const merged = await mergePhotosSideBySide(leftPhoto, rightPhoto, layout.aspectRatio);
      
      setTempCapturedPhotos(prev => [...prev, merged]);
      logDebug('capture', 'Merged photo stored and advancing', { step });

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
            // Only (re)start the camera if it isn't already running — avoids
            // tearing down and re-requesting a stream that's already active.
            if (!streamRef.current) {
              startCamera(selectedDeviceId);
            }
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

          {isInstagramBrowser && (
            <div className="bg-red-100 border border-red-300 text-red-800 p-3 rounded-xl text-xs font-sans font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                <strong>Instagram Browser Detected!</strong><br/>
                Instagram blocks real-time connections. Please tap the three dots (•••) at the top right and select <strong>"Open in system browser"</strong> (Chrome/Safari) to use Couple Mode.
              </p>
            </div>
          )}
          
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
            {[
              { label: 'Role', value: webRtcStatus.role || 'idle' },
              { label: 'Peer', value: webRtcStatus.peerState },
              { label: 'Data', value: webRtcStatus.dataState },
              { label: 'Media', value: webRtcStatus.mediaState },
              { label: 'ICE', value: webRtcStatus.iceState },
              { label: 'Signal', value: webRtcStatus.signalingState },
              { label: 'Conn', value: webRtcStatus.connectionState },
              { label: 'Last', value: webRtcStatus.lastEvent }
            ].map(item => (
              <div key={item.label} className="bg-white/80 border border-stone-200 rounded-xl px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-stone-400">{item.label}</div>
                <div className="text-[11px] font-mono text-stone-800 break-words mt-1">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-stone-950 text-stone-100 rounded-2xl border border-stone-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Debug Trace</span>
              <button
                type="button"
                onClick={() => setDebugEntries([])}
                className="text-[10px] text-stone-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="max-h-56 overflow-auto space-y-2 pr-1 font-mono text-[10px] leading-relaxed">
              {debugEntries.length === 0 ? (
                <div className="text-stone-500">Waiting for events...</div>
              ) : (
                debugEntries.map(entry => (
                  <div key={entry.id} className="rounded-lg bg-white/5 border border-white/5 px-2 py-1">
                    <div className="text-emerald-300">[{entry.time}] {entry.section}</div>
                    <div className="text-stone-200">{entry.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {coupleModeActive && isConnected && (
        <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center justify-between text-xs font-sans text-emerald-850">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected! Live WebRTC preview is Active.</span>
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
                  <RobustVideo 
                    ref={videoRef} 
                    stream={localStream} 
                    isMirrored={true}
                    label={coupleModeActive && isConnected ? "You" : undefined}
                  />
                  
                  {/* Right screen: Partner video preview via WebRTC Media Stream */}
                  {coupleModeActive && isConnected && (
                    <RobustVideo 
                      stream={partnerStream} 
                      isMirrored={true}
                      label={
                        <>
                          <Heart className="w-3 h-3 fill-rose-500 text-rose-500 animate-pulse" />
                          Partner
                        </>
                      }
                    />
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
