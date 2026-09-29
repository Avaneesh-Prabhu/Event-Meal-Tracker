import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  CameraOff, 
  Keyboard, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RotateCcw, 
  Clock, 
  User, 
  ShieldAlert, 
  Sparkles,
  Search,
  ArrowRight,
  Info
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AppUser, Meal, MealLog, ScanResult } from '../types';
import { StorageService } from '../services/storage';
import { soundService } from '../services/sound';

interface ScannerViewProps {
  currentUser: AppUser | null;
  activeMeal: Meal | null;
  onOpenScheduleModal: () => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  currentUser,
  activeMeal,
  onOpenScheduleModal
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualUid, setManualUid] = useState<string>('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<MealLog[]>([]);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // How long the blue "Meal Logged" card stays before an "Already Served"
  // result for the same person may replace it, and how long an identical
  // camera read is ignored (the camera decodes the same QR ~10x per second).
  const SUCCESS_HOLD_MS = 6000;
  const SAME_CODE_COOLDOWN_MS = 6000;
  const lastSuccessRef = useRef<{ uid: number; at: number } | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const inFlightRef = useRef(false);
  // Camera callbacks are created once, so always call the latest handler via a ref.
  const executeScanRef = useRef<(raw: string | number) => void>(() => {});
  const scannerContainerId = 'qr-reader-container';

  // Load recent logs for this counter
  const refreshRecentLogs = () => {
    const logs = StorageService.getLogs();
    setRecentScans(logs.slice(0, 10));
  };

  useEffect(() => {
    refreshRecentLogs();
    const unsub = StorageService.subscribe(refreshRecentLogs);
    return () => unsub();
  }, []);

  // Handle Scan Logic
  const handleExecuteScan = async (rawInput: string | number) => {
    if (!currentUser) return;

    // Ignore the camera re-reading the same code again and again
    const code = String(rawInput).trim();
    const now = Date.now();
    if (lastCodeRef.current && lastCodeRef.current.code === code && now - lastCodeRef.current.at < SAME_CODE_COOLDOWN_MS) {
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastCodeRef.current = { code, at: now };

    try {
      const result = await StorageService.processScan(rawInput, currentUser.usn);

      // Keep the blue success card visible for a while before replacing it
      // with "already served" for that same person.
      const held = lastSuccessRef.current;
      if (
        result.status === 'ALREADY_SCANNED' &&
        held &&
        result.participant?.uid === held.uid &&
        Date.now() - held.at < SUCCESS_HOLD_MS
      ) {
        return;
      }

      if (result.status === 'SUCCESS' && result.participant) {
        lastSuccessRef.current = { uid: result.participant.uid, at: Date.now() };
      }

      setLastResult(result);

      // Audio & tactile feedback
      if (result.status === 'SUCCESS') {
        soundService.playSuccess();
      } else if (result.status === 'ALREADY_SCANNED') {
        soundService.playWarning();
      } else {
        soundService.playError();
      }

      refreshRecentLogs();
    } finally {
      inFlightRef.current = false;
    }
  };
  executeScanRef.current = handleExecuteScan;

  // Undo Handler
  const handleUndoScan = (logId: string) => {
    setIsUndoing(true);
    const success = StorageService.undoScan(logId);
    if (success) {
      lastSuccessRef.current = null;
      lastCodeRef.current = null;
      if (lastResult && lastResult.logId === logId) {
        setLastResult(null);
      }
      refreshRecentLogs();
    }
    setIsUndoing(false);
  };

  // Manual Form Submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) return;
    handleExecuteScan(manualUid.trim());
    setManualUid('');
  };

  // Start Camera QR Scanner
  const startCameraScanner = async () => {
    setCameraError(null);
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch {
          // ignore
        }
      }

      const qrScanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      html5QrCodeRef.current = qrScanner;

      await qrScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          executeScanRef.current(decodedText);
        },
        () => {
          // QR code not found in frame - silent scan frame
        }
      );

      setCameraActive(true);
    } catch (err: unknown) {
      console.warn('Camera scan start failed', err);
      setCameraError(
        'Unable to access camera. Please allow camera permissions or use the manual keypad below.'
      );
      setCameraActive(false);
    }
  };

  // Stop Camera QR Scanner
 const stopCameraScanner = async () => {
  if (html5QrCodeRef.current) {
    try {
      if (html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch (err) {
      console.warn('Error stopping scanner:', err);
    } finally {
      html5QrCodeRef.current = null;
      setCameraActive(false);
    }
  }
};

 useEffect(() => {
  if (activeTab === 'camera') {
    startCameraScanner();
  } else {
    stopCameraScanner();
  }
  return () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(() => {});
        }
      } catch {
        // Ignore stop errors on unmount
      }
    }
  };
}, [activeTab]);

  const sampleParticipants = StorageService.getParticipants().slice(0, 6);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner: Meal Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div className="flex items-center space-x-3.5">
          
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Service Window</span>
              {activeMeal ? (
                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/40">
                  Scanning Open
                </span>
              ) : (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                  Counter Closed
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {activeMeal ? activeMeal.name : 'No Active Meal at This Time'}
            </h1>
            <p className="text-xs text-slate-400">
              {activeMeal 
                ? `Window: ${activeMeal.startTime} – ${activeMeal.endTime} • Scan the participant's QR code or enter their UID` 
                : 'Scans will be declined until the next meal window begins. The clock can be adjusted in settings.'}
            </p>
          </div>
        </div>

        {!activeMeal && (
          <button
            onClick={onOpenScheduleModal}
            className="self-start sm:self-center px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Simulate / Adjust Meal Time</span>
          </button>
        )}
      </div>

      {/* Main Scanner Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Scanner & Keypad (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            
            {/* Tab switch */}
            <div className="flex border-b border-slate-800 bg-slate-900/50">
              <button
                id="scanner-camera-tab"
                onClick={() => setActiveTab('camera')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'camera'
                    ? 'border-blue-500 text-white bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Camera QR Scanner</span>
              </button>

              <button
                id="scanner-manual-tab"
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'manual'
                    ? 'border-blue-500 text-white bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                <span>Manual UID Keypad</span>
              </button>
            </div>

            <div className="p-4 sm:p-6">
              
              {/* Camera Viewfinder */}
              {activeTab === 'camera' && (
                <div className="space-y-4">
                  <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 min-h-[300px] flex items-center justify-center">
                    <div id={scannerContainerId} className="w-full h-full min-h-[280px]"></div>

                    {/* Camera error / fallback prompt */}
                    {cameraError && (
                      <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <CameraOff className="w-10 h-10 text-slate-500" />
                        <p className="text-xs text-slate-300 max-w-sm">{cameraError}</p>
                        <button
                          onClick={() => setActiveTab('manual')}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Switch to Manual UID Keypad
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span className="flex items-center space-x-1.5">
                     
                    </span>
                    <button
                      onClick={() => {
                        stopCameraScanner();
                        setTimeout(startCameraScanner, 300);
                      }}
                      className="text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Restart Camera
                    </button>
                  </div>
                </div>
              )}

              {/* Manual UID Entry */}
              {activeTab === 'manual' && (
                <div className="space-y-4">
                  <form onSubmit={handleManualSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Enter Participant Numeric UID
                      </label>
                      <div className="flex space-x-2">
                        <div className="relative flex-1">
                          <input
                            id="manual-uid-input"
                            type="number"
                            autoFocus
                            value={manualUid}
                            onChange={(e) => setManualUid(e.target.value)}
                            placeholder="e.g. 1004"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          id="submit-manual-scan-btn"
                          type="submit"
                          className="px-5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition-colors flex items-center space-x-2 cursor-pointer"
                        >
                          <span>Verify</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* On-screen Keypad for tablet or touch screen counters */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => setManualUid((prev) => prev + digit)}
                        className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-base font-semibold text-white transition-colors cursor-pointer"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setManualUid('')}
                      className="py-2.5 bg-slate-800/60 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-xs font-semibold text-amber-400 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualUid((prev) => prev + '0')}
                      className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-base font-semibold text-white transition-colors cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualUid((prev) => prev.slice(0, -1))}
                      className="py-2.5 bg-slate-800/60 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}


            </div>
          </div>

        </div>

        {/* Right Column: Scan Result Banner & Recent Activity (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Result Card: Displayed right next to scan per PRD 4.3 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Scan Feedback & Verification
            </h2>

            {lastResult ? (
              <div className="space-y-4">
                
                {/* 1. SUCCESS: First scan for this meal */}
                {lastResult.status === 'SUCCESS' && (
                  <div className="bg-blue-950/70 border-2 border-blue-500 rounded-xl p-4 text-blue-100 space-y-3 animate-in fade-in">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <CheckCircle2 className="w-7 h-7 text-blue-400 shrink-0" />
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                            Meal Logged Successfully
                          </span>
                          <h3 className="text-base font-bold text-white">
                            {lastResult.message}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {lastResult.participant && (
                      <div className="bg-slate-900/80 p-3 rounded-lg border border-blue-900/60 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">UID:</span>
                          <span className="font-mono font-bold text-blue-300">#{lastResult.participant.uid}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Team:</span>
                          <span className="font-semibold text-white">{lastResult.participant.team}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Dietary:</span>
                          <span className="text-slate-200">{lastResult.participant.dietary || 'Regular'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Meal:</span>
                          <span className="text-blue-400 font-semibold">{lastResult.meal?.name}</span>
                        </div>
                      </div>
                    )}

                    {/* PRD Question 2: Instant Undo Accidental Scan Button */}
                    {lastResult.logId && (
                      <button
                        id="undo-last-scan-btn"
                        type="button"
                        disabled={isUndoing}
                        onClick={() => handleUndoScan(lastResult.logId!)}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Undo This Scan</span>
                      </button>
                    )}
                  </div>
                )}

                {/* 2. ALREADY SCANNED: Duplicate warning */}
                {lastResult.status === 'ALREADY_SCANNED' && (
                  <div className="bg-amber-950/60 border-2 border-amber-500 rounded-xl p-4 text-amber-100 space-y-3 animate-in fade-in">
                    <div className="flex items-start space-x-2.5">
                      <AlertTriangle className="w-7 h-7 text-amber-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Already Served
                        </span>
                        <h3 className="text-base font-bold text-white">
                          {lastResult.message}
                        </h3>
                      </div>
                    </div>

                    {lastResult.existingLog && (
                      <div className="bg-slate-900/80 p-3 rounded-lg border border-amber-900/60 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Previously Served:</span>
                          <span className="font-mono text-amber-300">
                            {new Date(lastResult.existingLog.scannedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Verified By:</span>
                          <span className="font-mono text-slate-200">
                            USN {lastResult.existingLog.scannedByUsn}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Team:</span>
                          <span className="text-slate-200">{lastResult.participant?.team}</span>
                        </div>
                      </div>
                    )}

                    {/* Can undo even an existing log if it was an error */}
                    {lastResult.existingLog && (
                      <button
                        type="button"
                        onClick={() => handleUndoScan(lastResult.existingLog!.id)}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Undo Previous Scan</span>
                      </button>
                    )}
                  </div>
                )}

                {/* 3. NO ACTIVE MEAL */}
                {lastResult.status === 'NO_ACTIVE_MEAL' && (
                  <div className="bg-slate-800/80 border-2 border-cyan-500/60 rounded-xl p-4 text-slate-200 space-y-3 animate-in fade-in">
                    <div className="flex items-start space-x-2.5">
                      <Clock className="w-6 h-6 text-cyan-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                          Outside Service Hours
                        </span>
                        <p className="text-xs text-slate-300 mt-1">{lastResult.message}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenScheduleModal}
                      className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-cyan-300 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Adjust / Simulate Meal Clock</span>
                    </button>
                  </div>
                )}

                {/* 4. INVALID PARTICIPANT */}
                {lastResult.status === 'INVALID_PARTICIPANT' && (
                  <div className="bg-red-950/60 border-2 border-red-500 rounded-xl p-4 text-red-100 space-y-2 animate-in fade-in">
                    <div className="flex items-start space-x-2.5">
                      <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-red-300">
                          Unrecognized QR Code
                        </span>
                        <p className="text-xs text-red-200 mt-1">{lastResult.message}</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500 space-y-2">
                <User className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs font-medium">Ready to scan. Present the wristband QR code or enter the UID.</p>
              </div>
            )}
          </div>

          {/* Recent Scans List at this counter */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recent Scans Log ({recentScans.length})
              </h2>
              <span className="text-[10px] text-slate-500">Auto-synced</span>
            </div>

            {recentScans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No scans recorded yet for today.</p>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[300px] overflow-y-auto pr-1">
                {recentScans.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-200">{log.participantName}</span>
                        <span className="font-mono text-[10px] text-blue-400 bg-blue-950/50 px-1 py-0.2 rounded border border-blue-900">
                          #{log.participantUid}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {log.team} • {log.mealName} • {new Date(log.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>

                    {/* Undo button per row */}
                    <button
                      type="button"
                      onClick={() => handleUndoScan(log.id)}
                      title="Undo scan for this participant"
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
