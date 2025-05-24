
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
      if (speechRecognitionRef.current && !isListening && !isPreparingMic && !userClickedStopRef.current && !micError) {
        try {
            speechRecognitionRef.current.start();
        } catch (e) {
            console.warn("Error trying to restart mic in processTranscription finally:", e);
        }
      }
    }
  }, [toast, isListening, isPreparingMic, micError]); 

  const toggleListening = useCallback(() => {
    clearPreparingMicTimeout();
    if (!speechRecognitionRef.current) {
      setMicError("Speech recognition is not available.");
      toast({ variant: 'destructive', title: 'Error', description: 'Speech recognition not available.' });
      return;
    }

    if (isListening) {
      userClickedStopRef.current = true; 
      speechRecognitionRef.current.stop();
    } else {
      userClickedStopRef.current = false; 
      setMicError(null); 
      setIsPreparingMic(true);

      preparingTimeoutIdRef.current = setTimeout(() => {
        const errorMsg = "Microphone preparation timed out. Please check permissions or try again.";
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
        speechRecognitionRef.current.start();
      } catch (error) {
        console.error("Error starting recognition:", error);
        clearPreparingMicTimeout();
        const errorMsg = "Failed to start microphone. Please check permissions and hardware.";
        setMicError(errorMsg);
        toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
        setIsPreparingMic(false);
        setIsListening(false);
        userClickedStopRef.current = true; 
      }
    }
  }, [isListening, toast, clearPreparingMicTimeout]); 

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
          clearPreparingMicTimeout();
          setIsListening(true);
          setIsPreparingMic(false);
          setMicError(null); 
        };

        recognition.onresult = (event: any) => {
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
              window.speechSynthesis.cancel();
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
          if (event.error === 'no-speech') {
            errorMsg = 'No speech was detected for a while.'; 
          } else if (event.error === 'audio-capture') {
            errorMsg = 'Audio capture failed. Is a microphone connected and enabled?';
            userClickedStopRef.current = true; 
          } else if (event.error === 'not-allowed') {
            errorMsg = 'Microphone access was denied. Please enable microphone permissions in your browser settings.';
            userClickedStopRef.current = true; 
          } else if (event.error === 'network') {
            errorMsg = 'A network error occurred with the speech recognition service.';
          } else if (event.error === 'language-not-supported') {
            errorMsg = 'The selected language (Kinyarwanda) is not supported by your browser/OS speech recognition.';
            userClickedStopRef.current = true;
          }
          setMicError(errorMsg);
          toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
          setIsListening(false);
          setIsPreparingMic(false);
        };

        recognition.onend = () => {
          clearPreparingMicTimeout();
          setIsListening(false);
          setIsPreparingMic(false);
          if (!userClickedStopRef.current && speechRecognitionRef.current) {
            const currentMicError = micError; // Check the micError state at the time of onend
            if (currentMicError && (currentMicError.includes("denied") || currentMicError.includes("capture failed") || currentMicError.includes("not supported"))) {
                // Don't try to restart if fundamental mic issue
            } else {
                try {
                    console.log("Attempting to restart recognition in onend");
                    speechRecognitionRef.current.start(); 
                    // Note: If this start() also needs a "preparing" state, it's not set here.
                    // However, onstart should still fire and set isListening true / isPreparingMic false.
                    // If this start fails silently without onstart, it will just remain not listening.
                } catch (e) {
                    console.error("Error restarting recognition in onend:", e);
                    userClickedStopRef.current = true;
                }
            }
          }
        };
        setIsMicSetupComplete(true);
    }
    
    return () => {
      clearPreparingMicTimeout();
      if (speechRecognitionRef.current) {
        userClickedStopRef.current = true; 
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        try {
            speechRecognitionRef.current.stop();
        } catch (e) {}
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [processTranscription, toast, micError, clearPreparingMicTimeout]);


  useEffect(() => {
    if (isMicSetupComplete && speechRecognitionRef.current && !isListening && !isPreparingMic && !micError && !userClickedStopRef.current) {
      toggleListening(); 
    }
  }, [isMicSetupComplete, isListening, isPreparingMic, micError, toggleListening]);

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
      if (typeof window === 'undefined' || micError || audioContextRef.current || !isListening) return;
      try {
        // Only request if not already available or if context is stopped/closed
        if (!microphoneStreamRef.current || microphoneStreamRef.current.getAudioTracks().every(t => t.readyState === 'ended')) {
          microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const AudioContextAPI = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextAPI) { return; }

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContextAPI();
        }
        // Ensure context is running
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; 
        mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(microphoneStreamRef.current);
        mediaStreamSourceRef.current.connect(analyserRef.current);
        audioDataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        animationFrameIdRef.current = requestAnimationFrame(processAudioFrame);
      } catch (err) { console.warn('Could not initialize audio visualizer:', err); }
    };

    const cleanupAudioVisualizer = () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      if (mediaStreamSourceRef.current) mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null; // Allow it to be recreated if needed
      analyserRef.current = null;
      // Do not stop microphoneStreamRef tracks here if SpeechRecognition is using it or if we want to reuse it.
      // Let's assume SpeechRecognition manages its own stream. The visualizer stream might need separate management if it's distinct.
      // For now, we are creating a new stream for the visualizer. So it's okay to stop its tracks.
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.warn("Error closing visualizer audio context:", e));
        // audioContextRef.current = null; // Do not nullify if we intend to resume/reuse
      }
      // audioDataArrayRef.current = null; // Keep if reusing
      setVoiceActivityData([0,0,0,0,0]);
    };

    if (isListening && !isPreparingMic) { initAudioVisualizer(); } 
    else { cleanupAudioVisualizer(); }
    
    // Stricter cleanup on unmount
    return () => {
        cleanupAudioVisualizer();
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(e => console.warn("Error closing visualizer audio context on unmount:", e));
        }
        audioContextRef.current = null; // Ensure it's fully cleaned for next mount
    };
  }, [isListening, isPreparingMic, micError]); // Added micError to re-evaluate visualizer


  const handleSelectResponse = (option: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    setInterimTranscript(''); 
    
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(option);
    utterance.lang = 'rw-RW'; 
    
    utterance.onstart = () => {
      setIsSpeakingTTS(true);
      // If recognition is active, stop it during TTS to prevent feedback loops or unwanted transcriptions.
      if (speechRecognitionRef.current && isListening) {
        console.log("Stopping recognition during TTS");
        speechRecognitionRef.current.stop(); // onend will handle restart if appropriate
      }
    };
    utterance.onend = () => {
      setIsSpeakingTTS(false);
      setConversation(prev => {
        const lastTurnIndex = prev.length - 1;
        if (lastTurnIndex >= 0 && prev[lastTurnIndex].userText && !prev[lastTurnIndex].aiResponse) { 
          const updatedConversation = [...prev];
          updatedConversation[lastTurnIndex] = { ...updatedConversation[lastTurnIndex], aiResponse: option, isProcessingAI: false };
          return updatedConversation;
        }
        return prev;
      });
      // Attempt to restart recognition if it was stopped for TTS and user hasn't manually stopped it.
      if (speechRecognitionRef.current && !isListening && !isPreparingMic && !userClickedStopRef.current && !micError) {
        try {
            console.log("Attempting to restart mic in TTS onend");
            speechRecognitionRef.current.start();
        } catch (e) {
            console.warn("Error trying to restart mic in TTS onend:", e);
        }
      }
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      toast({
        variant: 'destructive',
        title: 'TTS Error',
        description: 'Could not speak the response.',
      });
      setIsSpeakingTTS(false);
      // Also try to restart mic if TTS fails and it should be listening
       if (speechRecognitionRef.current && !isListening && !isPreparingMic && !userClickedStopRef.current && !micError) {
        try {
            speechRecognitionRef.current.start();
        } catch (e) {
            console.warn("Error trying to restart mic after TTS error:", e);
        }
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
        {!isListening && !isPreparingMic && !interimTranscript && <div className="h-[52px]" aria-hidden="true"></div>}
      </div>

      <footer className="px-4 md:px-6 pb-4 md:pb-6 space-y-4 border-t border-border pt-4 bg-background sticky bottom-0">
        <ResponseOptionsDisplay
          options={responseOptions}
          isLoading={isProcessingAI}
          onSelect={handleSelectResponse}
          disabled={isPreparingMic || responseOptions.length === 0 || isProcessingAI /* Removed isListening and isSpeakingTTS from disabled condition */}
        />
        <div className="flex justify-center">
          <MicrophoneButton
            isListening={isListening}
            isPreparing={isPreparingMic}
            onClick={toggleListening}
            disabled={!isMicSetupComplete || (micError !== null && (micError.includes("denied") || micError.includes("not supported") || micError.includes("capture failed"))) || isProcessingAI }
          />
        </div>
      </footer>
    </div>
  );
}

