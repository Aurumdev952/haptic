
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConversationTurn } from '@/components/haptic/ConversationTurnCard';
import ConversationView from '@/components/haptic/ConversationView';
import ResponseOptionsDisplay from '@/components/haptic/ResponseOptionsDisplay';
import MicrophoneButton from '@/components/haptic/MicrophoneButton';
import VoiceActivityIndicator from '@/components/haptic/VoiceActivityIndicator';
import { generateResponseOptions } from '@/ai/flows/generate-response-options';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// SpeechRecognition type definition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
    webkitAudioContext: typeof AudioContext | undefined;
  }
}
type SpeechRecognition = any; 

const PREPARING_TIMEOUT_DURATION = 10000; // 10 seconds

export default function HapticPage() {
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [responseOptions, setResponseOptions] = useState<string[]>([]);
  
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPreparingMic, setIsPreparingMic] = useState<boolean>(false);
  const [isProcessingAI, setIsProcessingAI] = useState<boolean>(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<boolean>(false);
  
  const [micError, setMicError] = useState<string | null>(null);
  const [isMicSetupComplete, setIsMicSetupComplete] = useState<boolean>(false);
  const userClickedStopRef = useRef<boolean>(false); 

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const preparingTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null); 

  const [voiceActivityData, setVoiceActivityData] = useState<number[]>([0, 0, 0, 0, 0]);

  const scrollToBottom = () => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [conversation, interimTranscript]);

  const clearPreparingMicTimeout = useCallback(() => {
    if (preparingTimeoutIdRef.current) {
      clearTimeout(preparingTimeoutIdRef.current);
      preparingTimeoutIdRef.current = null;
    }
  }, []);

  // Renamed and refined toggleListening to handle starting microphone more centrally
  const attemptStartListening = useCallback(() => {
    if (typeof window === 'undefined' || !speechRecognitionRef.current) {
      const errorMsg = "Speech recognition is not available or not initialized.";
      setMicError(errorMsg);
      toast({ variant: 'destructive', title: 'Error', description: errorMsg });
      setIsPreparingMic(false); // Ensure preparing is false if we can't even attempt
      setIsListening(false);
      userClickedStopRef.current = true; // Prevent auto-restart loops
      return;
    }

    // If already listening or preparing, do nothing
    if (isListening || isPreparingMic) {
      console.log("AttemptStartListening: Already listening or preparing, skipping.");
      return;
    }

    clearPreparingMicTimeout();
    userClickedStopRef.current = false; 
    setMicError(null); 
    setIsPreparingMic(true);
    console.log("AttemptStartListening: Set isPreparingMic = true");

    preparingTimeoutIdRef.current = setTimeout(() => {
      const errorMsg = "Microphone preparation timed out. Please check permissions or ensure the microphone is working. Try refreshing the page.";
      console.warn(errorMsg);
      setMicError(errorMsg);
      toast({ variant: 'destructive', title: 'Microphone Timeout', description: errorMsg });
      setIsPreparingMic(false);
      setIsListening(false);
      userClickedStopRef.current = true; 
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          console.warn("Error stopping recognition on timeout:", e);
        }
      }
    }, PREPARING_TIMEOUT_DURATION);

    try {
      console.log("AttemptStartListening: Calling speechRecognitionRef.current.start()");
      speechRecognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition in attemptStartListening:", error);
      clearPreparingMicTimeout();
      const errorMsg = `Failed to start microphone: ${error.message || 'Check permissions and hardware.'}`;
      setMicError(errorMsg);
      toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
      setIsPreparingMic(false);
      setIsListening(false);
      userClickedStopRef.current = true; 
    }
  }, [isListening, isPreparingMic, toast, clearPreparingMicTimeout]);

  const stopListening = useCallback(() => {
    if (typeof window === 'undefined' || !speechRecognitionRef.current) return;
    
    userClickedStopRef.current = true;
    clearPreparingMicTimeout(); // Clear if it was in preparing phase
    if (speechRecognitionRef.current) {
        try {
            speechRecognitionRef.current.stop();
            console.log("StopListening: Called speechRecognitionRef.current.stop()");
        } catch (e) {
            console.warn("Error stopping recognition in stopListening:", e);
        }
    }
    // onend will handle setting isListening and isPreparingMic to false
  }, [clearPreparingMicTimeout]);

  const handleMicButtonClick = useCallback(() => {
    if (isListening || isPreparingMic) {
      stopListening();
    } else {
      attemptStartListening();
    }
  }, [isListening, isPreparingMic, stopListening, attemptStartListening]);


  const processTranscription = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    const newTurnId = Date.now().toString();
    setConversation(prev => [...prev, { id: newTurnId, userText: transcript, timestamp: new Date(), isProcessingAI: true }]);
    setResponseOptions([]);
    setIsProcessingAI(true);

    try {
      const result = await generateResponseOptions({ transcribedInput: transcript });
      setResponseOptions(result.responseOptions);
      setConversation(prev => prev.map(turn => turn.id === newTurnId ? { ...turn, isProcessingAI: false } : turn));
    } catch (error) {
      console.error('Error generating AI responses:', error);
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not generate response options.',
      });
      setConversation(prev => prev.map(turn => turn.id === newTurnId ? { ...turn, isProcessingAI: false, aiResponse: "[Error fetching responses]" } : turn));
    } finally {
      setIsProcessingAI(false);
      // If not manually stopped and no critical error, try to restart listening
      if (speechRecognitionRef.current && !userClickedStopRef.current && !micError && !isListening && !isPreparingMic) {
        console.log("ProcessTranscription: Attempting to restart listening.");
        attemptStartListening();
      }
    }
  }, [toast, micError, attemptStartListening, isListening, isPreparingMic]); 

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMicError("Speech recognition is not supported by your browser. Try Chrome or Edge.");
      setIsMicSetupComplete(true); 
      userClickedStopRef.current = true; 
      return;
    }
    
    if (!speechRecognitionRef.current) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        const recognition = speechRecognitionRef.current!;
        recognition.continuous = true; 
        recognition.interimResults = true;
        recognition.lang = 'rw-RW'; 

        recognition.onstart = () => {
          console.log("Recognition.onstart fired");
          clearPreparingMicTimeout();
          setIsListening(true);
          setIsPreparingMic(false);
          setMicError(null); 
        };

        recognition.onresult = (event: any) => {
          console.log("Recognition.onresult fired");
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setInterimTranscript(interim);

          if (final.trim()) {
            if (window.speechSynthesis && window.speechSynthesis.speaking) {
              window.speechSynthesis.cancel(); // Stop TTS if user speaks
              setIsSpeakingTTS(false);
            }
            setInterimTranscript(''); 
            processTranscription(final.trim());
          }
        };

        recognition.onerror = (event: any) => {
          clearPreparingMicTimeout();
          console.error('Speech recognition error:', event.error);
          let errorMsg = 'An unknown microphone error occurred.';
          let criticalError = false;
          if (event.error === 'no-speech') {
            errorMsg = 'No speech was detected. Please ensure your microphone is working and try speaking clearly.'; 
            // Not necessarily critical, might auto-restart if desired.
          } else if (event.error === 'audio-capture') {
            errorMsg = 'Audio capture failed. Is a microphone connected and enabled? Please check system settings.';
            criticalError = true; 
          } else if (event.error === 'not-allowed') {
            errorMsg = 'Microphone access was denied. Please enable microphone permissions in your browser settings for this site.';
            criticalError = true; 
          } else if (event.error === 'network') {
            errorMsg = 'A network error occurred with the speech recognition service. Check your internet connection.';
            // Not necessarily critical for userClickedStopRef, service might recover.
          } else if (event.error === 'language-not-supported') {
            errorMsg = 'The selected language (Kinyarwanda) is not supported by your browser/OS speech recognition service.';
            criticalError = true;
          } else if (event.error === 'service-not-allowed' || event.error === 'aborted') {
             errorMsg = `Speech recognition service error: ${event.error}. It might be temporary.`;
          }
          
          setMicError(errorMsg);
          toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
          setIsListening(false);
          setIsPreparingMic(false);
          if (criticalError) {
            userClickedStopRef.current = true; // Prevent auto-restarts for critical, user-fixable errors
          }
        };

        recognition.onend = () => {
          console.log("Recognition.onend fired. userClickedStopRef:", userClickedStopRef.current, "micError:", micError);
          clearPreparingMicTimeout();
          setIsListening(false);
          setIsPreparingMic(false); 
          
          if (!userClickedStopRef.current && !micError) { // Only restart if no manual stop and no persistent error
            console.log("Recognition.onend: Conditions met, attempting to restart listening.");
            attemptStartListening();
          } else {
            console.log("Recognition.onend: Conditions NOT met for restart.");
          }
        };
        setIsMicSetupComplete(true);
    }
    
    // Cleanup function
    return () => {
      clearPreparingMicTimeout();
      if (speechRecognitionRef.current) {
        // userClickedStopRef.current = true; // Ensure it doesn't try to restart after component unmounts
        const rec = speechRecognitionRef.current;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null; // Crucial to remove onend before stopping, to prevent restart logic during unmount
        try {
            rec.stop();
            console.log("Cleaned up speech recognition instance on unmount.");
        } catch (e) {
            console.warn("Error stopping recognition on unmount:", e);
        }
        // speechRecognitionRef.current = null; // Don't nullify if other parts might access it immediately before full unmount
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [processTranscription, toast, micError, clearPreparingMicTimeout, attemptStartListening]);


  useEffect(() => {
    if (isMicSetupComplete && !isListening && !isPreparingMic && !micError && !userClickedStopRef.current) {
      console.log("Initial mic start useEffect: conditions met, attempting to start listening.");
      attemptStartListening(); 
    }
  }, [isMicSetupComplete, isListening, isPreparingMic, micError, userClickedStopRef, attemptStartListening]); // Added userClickedStopRef

  // Audio Visualizer Effect
  useEffect(() => {
    const NUM_BARS = 5;
    const processAudioFrame = () => {
      if (analyserRef.current && audioDataArrayRef.current && audioContextRef.current?.state === 'running') {
        analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
        const dataArray = audioDataArrayRef.current;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const newBarValues = new Array(NUM_BARS).fill(0);
        const segmentSize = Math.floor(bufferLength / NUM_BARS);
        for (let i = 0; i < NUM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < segmentSize; j++) {
            sum += dataArray[i * segmentSize + j];
          }
          const average = sum / segmentSize;
          newBarValues[i] = (average / 255) * 100; 
        }
        setVoiceActivityData(newBarValues);
      }
      animationFrameIdRef.current = requestAnimationFrame(processAudioFrame);
    };

    const initAudioVisualizer = async () => {
      if (typeof window === 'undefined' || audioContextRef.current || !isListening) return; // Don't init if context exists or not listening
      if (micError && (micError.includes("denied") || micError.includes("capture failed"))) return; // Don't init if critical mic error

      try {
        if (!microphoneStreamRef.current || microphoneStreamRef.current.getAudioTracks().every(t => t.readyState === 'ended')) {
          microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const AudioContextAPI = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextAPI) { return; }

        audioContextRef.current = new AudioContextAPI();
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; 
        mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(microphoneStreamRef.current);
        mediaStreamSourceRef.current.connect(analyserRef.current);
        audioDataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        animationFrameIdRef.current = requestAnimationFrame(processAudioFrame);
        console.log("Audio visualizer initialized");
      } catch (err) { console.warn('Could not initialize audio visualizer:', err); }
    };

    const cleanupAudioVisualizer = () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      
      if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
      }
      analyserRef.current = null;
      
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
        console.log("Visualizer microphone stream stopped.");
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().then(() => {
            console.log("Visualizer audio context closed.");
            audioContextRef.current = null; 
        }).catch(e => console.warn("Error closing visualizer audio context:", e));
      } else {
        audioContextRef.current = null; // Ensure it's null if already closed or never opened
      }
      setVoiceActivityData([0,0,0,0,0]);
    };

    if (isListening && !isPreparingMic) { initAudioVisualizer(); } 
    else { cleanupAudioVisualizer(); }
    
    return () => { // Stricter cleanup on unmount
        cleanupAudioVisualizer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [isListening, isPreparingMic, micError]); 


  const handleSelectResponse = (option: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    setInterimTranscript(''); 
    
    if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); }

    const utterance = new SpeechSynthesisUtterance(option);
    utterance.lang = 'rw-RW'; 
    
    utterance.onstart = () => {
      setIsSpeakingTTS(true);
      // If recognition is active, stop it during TTS
      // No, let's allow user to speak over TTS, onresult handles cancelling TTS
    };
    utterance.onend = () => {
      setIsSpeakingTTS(false);
      setConversation(prev => { // Update conversation with AI response
        const lastTurnIndex = prev.length - 1;
        if (lastTurnIndex >= 0 && prev[lastTurnIndex].userText && !prev[lastTurnIndex].aiResponse) { 
          const updatedConversation = [...prev];
          updatedConversation[lastTurnIndex] = { ...updatedConversation[lastTurnIndex], aiResponse: option, isProcessingAI: false };
          return updatedConversation;
        }
        return prev;
      });
      // If not manually stopped and no critical error, try to restart listening
      if (speechRecognitionRef.current && !userClickedStopRef.current && !micError && !isListening && !isPreparingMic) {
        console.log("TTS onend: Attempting to restart listening.");
        attemptStartListening();
      }
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      toast({ variant: 'destructive', title: 'TTS Error', description: 'Could not speak the response.'});
      setIsSpeakingTTS(false);
      // Also try to restart mic if TTS fails and it should be listening
       if (speechRecognitionRef.current && !userClickedStopRef.current && !micError && !isListening && !isPreparingMic) {
        console.log("TTS onerror: Attempting to restart listening.");
        attemptStartListening();
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b border-border shadow-sm">
        <h1 className="text-2xl font-bold text-primary">Haptic</h1>
      </header>

      {micError && (
         <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Microphone Error</AlertTitle>
              <AlertDescription>{micError}</AlertDescription>
            </Alert>
         </div>
      )}

      <main className="flex-grow overflow-y-auto p-4 md:p-6">
        <ConversationView conversation={conversation} />
        <div ref={conversationEndRef} />
      </main>

      <div className="px-4 md:px-6 pb-2 min-h-[72px] text-center flex flex-col items-center justify-center">
        {isPreparingMic && <p className="italic text-muted-foreground">Preparing microphone...</p>}
        
        {isListening && !isPreparingMic && (
          <div className="flex flex-col items-center space-y-1">
            <VoiceActivityIndicator audioData={voiceActivityData} />
            {interimTranscript ? (
              <p className="italic text-muted-foreground">{interimTranscript}</p>
            ) : (
              <p className="italic text-muted-foreground text-sm">Listening...</p>
            )}
          </div>
        )}

        {!isListening && !isPreparingMic && interimTranscript && (
           <div className="flex flex-col items-center space-y-1">
             <VoiceActivityIndicator audioData={[0,0,0,0,0]} /> 
             <p className="italic text-muted-foreground">{interimTranscript}</p>
           </div>
        )}
        {/* Placeholder for consistent height when nothing is shown */}
        {!isPreparingMic && !(isListening && !isPreparingMic) && !(!isListening && !isPreparingMic && interimTranscript) && 
          <div className="h-[52px]" aria-hidden="true"></div>
        }
      </div>

      <footer className="px-4 md:px-6 pb-4 md:pb-6 space-y-4 border-t border-border pt-4 bg-background sticky bottom-0">
        <ResponseOptionsDisplay
          options={responseOptions}
          isLoading={isProcessingAI}
          onSelect={handleSelectResponse}
          disabled={isPreparingMic || responseOptions.length === 0 || isProcessingAI }
        />
        <div className="flex justify-center">
          <MicrophoneButton
            isListening={isListening}
            isPreparing={isPreparingMic}
            onClick={handleMicButtonClick} // Changed to new handler
            disabled={!isMicSetupComplete || (micError !== null && (micError.includes("denied") || micError.includes("not supported") || micError.includes("capture failed") || micError.includes("Audio capture failed"))) || isProcessingAI || isSpeakingTTS }
          />
        </div>
      </footer>
    </div>
  );
}
