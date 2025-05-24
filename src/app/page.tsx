
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
  const userClickedStopRef = useRef<boolean>(false); // Tracks if user manually stopped mic

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const conversationEndRef = useRef<HTMLDivElement>(null);

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
      // Ensure mic attempts to listen again if not manually stopped and no error
      if (speechRecognitionRef.current && !isListening && !isPreparingMic && !userClickedStopRef.current && !micError) {
        try {
            speechRecognitionRef.current.start();
        } catch (e) {
            console.warn("Error trying to restart mic in processTranscription finally:", e);
        }
      }
    }
  }, [toast, isListening, isPreparingMic, micError]); // Added dependencies

  const toggleListening = useCallback(() => {
    if (!speechRecognitionRef.current) {
      setMicError("Speech recognition is not available.");
      toast({ variant: 'destructive', title: 'Error', description: 'Speech recognition not available.' });
      return;
    }

    if (isListening) {
      userClickedStopRef.current = true; // User explicitly stopped it
      speechRecognitionRef.current.stop();
    } else {
      userClickedStopRef.current = false; // User explicitly wants to start it
      setMicError(null); // Clear any previous error messages
      setIsPreparingMic(true);
      try {
        speechRecognitionRef.current.start();
      } catch (error) {
        console.error("Error starting recognition:", error);
        const errorMsg = "Failed to start microphone. Please check permissions and hardware.";
        setMicError(errorMsg);
        toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
        setIsPreparingMic(false);
        setIsListening(false);
        userClickedStopRef.current = true; // Treat failed start as a reason not to auto-restart
      }
    }
  }, [isListening, toast]); 

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMicError("Speech recognition is not supported by your browser. Try Chrome or Edge.");
      setIsMicSetupComplete(true); 
      userClickedStopRef.current = true; // Prevent auto-start if not supported
      return;
    }
    
    if (!speechRecognitionRef.current) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        const recognition = speechRecognitionRef.current!;
        recognition.continuous = true; 
        recognition.interimResults = true;
        recognition.lang = 'rw-RW'; 

        recognition.onstart = () => {
          setIsListening(true);
          setIsPreparingMic(false);
          setMicError(null); // Clear error on successful start
          // userClickedStopRef.current = false; // Reset if it starts successfully (covered by toggleListening)
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
            // Do NOT stop recognition here if continuous is true
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          let errorMsg = 'An unknown microphone error occurred.';
          if (event.error === 'no-speech') {
            // For continuous, 'no-speech' might be normal between utterances, 
            // but if it *stops* recognition, we might want to restart.
            // However, browsers handle this differently. Some stop, some don't.
            // If it does stop, onend will handle restart logic.
            errorMsg = 'No speech was detected for a while.'; 
            // Don't necessarily set userClickedStopRef.current = true for 'no-speech' with continuous
          } else if (event.error === 'audio-capture') {
            errorMsg = 'Audio capture failed. Is a microphone connected and enabled?';
            userClickedStopRef.current = true; // Prevent auto-restart loops for this
          } else if (event.error === 'not-allowed') {
            errorMsg = 'Microphone access was denied. Please enable microphone permissions in your browser settings.';
            userClickedStopRef.current = true; // Prevent auto-restart loops
          } else if (event.error === 'network') {
            errorMsg = 'A network error occurred with the speech recognition service.';
            // Potentially allow restart for transient network errors
          }
          setMicError(errorMsg);
          toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
          setIsListening(false);
          setIsPreparingMic(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          setIsPreparingMic(false);
          // Auto-restart if not manually stopped by user and no critical error
          if (!userClickedStopRef.current && !micError && speechRecognitionRef.current) {
            // Avoid restarting if an error like 'not-allowed' or 'audio-capture' just occurred.
            // MicError might be cleared by a successful .start() in toggleListening, so this check is tricky.
            // The 'userClickedStopRef.current = true' in certain error cases handles this.
            if (micError && (micError.includes("denied") || micError.includes("capture failed"))) {
                // Don't try to restart if fundamental mic issue
            } else {
                try {
                    console.log("Attempting to restart recognition in onend");
                    speechRecognitionRef.current.start();
                } catch (e) {
                    console.error("Error restarting recognition in onend:", e);
                     // If restart fails, behave as if user stopped it to prevent loops
                    userClickedStopRef.current = true;
                }
            }
          }
        };
        setIsMicSetupComplete(true);
    }
    
    return () => {
      if (speechRecognitionRef.current) {
        userClickedStopRef.current = true; // Ensure it's marked as stopped on unmount
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
  }, [processTranscription, toast, micError]); // Added micError


  // Effect for initial microphone auto-start
  useEffect(() => {
    if (isMicSetupComplete && speechRecognitionRef.current && !isListening && !isPreparingMic && !micError && !userClickedStopRef.current) {
      toggleListening(); // This will set userClickedStopRef.current = false and start
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
        microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextAPI = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextAPI) { return; }
        audioContextRef.current = new AudioContextAPI();
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
      mediaStreamSourceRef.current = null;
      analyserRef.current = null;
      if (microphoneStreamRef.current) microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(e => console.warn("Error closing visualizer audio context:", e));
      audioContextRef.current = null;
      audioDataArrayRef.current = null;
      setVoiceActivityData([0,0,0,0,0]);
    };

    if (isListening && !isPreparingMic) { initAudioVisualizer(); } 
    else { cleanupAudioVisualizer(); }
    return cleanupAudioVisualizer;
  }, [isListening, isPreparingMic, micError]);


  const handleSelectResponse = (option: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    setInterimTranscript(''); // Clear any lingering interim transcript
    
    // If AI is currently speaking, stop it before starting new utterance.
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      // setIsSpeakingTTS(false); // This will be set by onend of the *cancelled* utterance if it fires fast enough, or by the new one's onstart.
                           // For safety, explicitly manage it if cancelling.
    }

    const utterance = new SpeechSynthesisUtterance(option);
    utterance.lang = 'rw-RW'; 
    
    utterance.onstart = () => {
      setIsSpeakingTTS(true);
    };
    utterance.onend = () => {
      setIsSpeakingTTS(false);
      setConversation(prev => {
        const lastTurnIndex = prev.length - 1;
        if (lastTurnIndex >= 0 && prev[lastTurnIndex].userText && !prev[lastTurnIndex].aiResponse) { // Check userText to ensure it's a user turn
          const updatedConversation = [...prev];
          updatedConversation[lastTurnIndex] = { ...updatedConversation[lastTurnIndex], aiResponse: option, isProcessingAI: false };
          return updatedConversation;
        }
        // If the last turn was already an AI response or something else, this logic might need adjustment
        // For now, this targets appending AI response to the last user utterance.
        return prev;
      });
      // Ensure mic attempts to listen again if not manually stopped and no error
      if (speechRecognitionRef.current && !isListening && !isPreparingMic && !userClickedStopRef.current && !micError) {
        try {
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
          disabled={isPreparingMic || responseOptions.length === 0 || isProcessingAI } // Allow selection even if listening or speaking
        />
        <div className="flex justify-center">
          <MicrophoneButton
            isListening={isListening}
            isPreparing={isPreparingMic}
            onClick={toggleListening}
            // Disable button if mic setup isn't complete OR a permanent error exists OR AI is processing.
            // Allow clicking to stop even if TTS is speaking.
            disabled={!isMicSetupComplete || (micError !== null && (micError.includes("denied") || micError.includes("not supported") || micError.includes("capture failed"))) || isProcessingAI}
          />
        </div>
      </footer>
    </div>
  );
}

