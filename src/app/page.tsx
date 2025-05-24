
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
  const [initialMicStarted, setInitialMicStarted] = useState<boolean>(false); // New state for one-time auto-start

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Refs for Web Audio API and visualization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null); // For the visualizer's stream

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
    }
  }, [toast]);

  const toggleListening = useCallback(() => {
    if (!speechRecognitionRef.current) {
      setMicError("Speech recognition is not available.");
      toast({ variant: 'destructive', title: 'Error', description: 'Speech recognition not available.' });
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      // isListening will be set to false by recognition.onend or an error
    } else {
      setMicError(null);
      setIsPreparingMic(true);
      try {
        speechRecognitionRef.current.start();
        // isListening will be set to true by recognition.onstart
      } catch (error) {
        console.error("Error starting recognition:", error);
        const errorMsg = "Failed to start microphone. Please check permissions and hardware.";
        setMicError(errorMsg);
        toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
        setIsPreparingMic(false);
        setIsListening(false); // Ensure state is correct on error
      }
    }
  }, [isListening, toast]); 

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMicError("Speech recognition is not supported by your browser. Try Chrome or Edge.");
      setIsMicSetupComplete(true); 
      return;
    }
    
    if (!speechRecognitionRef.current) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        const recognition = speechRecognitionRef.current!;
        recognition.continuous = true; // Keep true for interim results
        recognition.interimResults = true;
        recognition.lang = 'rw-RW'; 

        recognition.onstart = () => {
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
            setInterimTranscript(''); // Clear interim once final is processed
            if (speechRecognitionRef.current) {
                // Stop listening to allow response selection. onend will set isListening to false.
                speechRecognitionRef.current.stop();
            }
            if (window.speechSynthesis.speaking) {
              window.speechSynthesis.cancel();
              setIsSpeakingTTS(false);
            }
            processTranscription(final.trim());
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          let errorMsg = 'An unknown microphone error occurred.';
          if (event.error === 'no-speech') {
            errorMsg = 'No speech was detected. Microphone might be muted or setup incorrectly.';
          } else if (event.error === 'audio-capture') {
            errorMsg = 'Audio capture failed. Is a microphone connected and enabled?';
          } else if (event.error === 'not-allowed') {
            errorMsg = 'Microphone access was denied. Please enable microphone permissions in your browser settings.';
          } else if (event.error === 'network') {
            errorMsg = 'A network error occurred with the speech recognition service.';
          }
          setMicError(errorMsg);
          toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
          setIsListening(false);
          setIsPreparingMic(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          setIsPreparingMic(false);
        };
        setIsMicSetupComplete(true);
    }
    
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        // Ensure stop is called to release resources and prevent memory leaks
        try {
            speechRecognitionRef.current.stop();
        } catch (e) {
            // Ignore errors if already stopped or in an invalid state
        }
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [processTranscription, toast]); // isListening removed as it's managed internally by onstart/onend


  // Effect for initial microphone auto-start
  useEffect(() => {
    if (isMicSetupComplete && speechRecognitionRef.current && !isListening && !isPreparingMic && !micError && !initialMicStarted) {
      toggleListening();
      setInitialMicStarted(true); // Mark that initial auto-start has occurred
    }
  }, [isMicSetupComplete, isListening, isPreparingMic, micError, initialMicStarted, toggleListening]);

  // Effect for Web Audio API based voice visualization
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
      if (typeof window === 'undefined' || micError || audioContextRef.current) return;

      try {
        microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioContextAPI = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextAPI) {
            console.warn("Web Audio API not supported for visualization.");
            return;
        }
        audioContextRef.current = new AudioContextAPI();
        
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; 
        
        mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(microphoneStreamRef.current);
        mediaStreamSourceRef.current.connect(analyserRef.current);
        
        audioDataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        animationFrameIdRef.current = requestAnimationFrame(processAudioFrame);

      } catch (err) {
        console.warn('Could not initialize audio visualizer:', err);
      }
    };

    const cleanupAudioVisualizer = () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current = null;
      }
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.warn("Error closing visualizer audio context:", e));
      }
      audioContextRef.current = null;
      audioDataArrayRef.current = null;
      setVoiceActivityData([0, 0, 0, 0, 0]); 
    };

    if (isListening && !isPreparingMic) {
      initAudioVisualizer();
    } else {
      cleanupAudioVisualizer();
    }

    return () => {
      cleanupAudioVisualizer();
    };
  }, [isListening, isPreparingMic, micError]);


  const handleSelectResponse = (option: string) => {
    if (isSpeakingTTS || typeof window === 'undefined' || !window.speechSynthesis) return;

    setInterimTranscript('');
    
    const utterance = new SpeechSynthesisUtterance(option);
    utterance.lang = 'rw-RW'; 
    
    utterance.onstart = () => {
      setIsSpeakingTTS(true);
    };
    utterance.onend = () => {
      setIsSpeakingTTS(false);
      setConversation(prev => {
        const lastTurnIndex = prev.length - 1;
        if (lastTurnIndex >= 0 && !prev[lastTurnIndex].aiResponse) {
          const updatedConversation = [...prev];
          updatedConversation[lastTurnIndex] = { ...updatedConversation[lastTurnIndex], aiResponse: option, isProcessingAI: false };
          return updatedConversation;
        }
        return prev;
      });
      // Optionally, restart listening after TTS:
      // if (!isListening && speechRecognitionRef.current && !isPreparingMic) {
      //   toggleListening();
      // }
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

        {!isListening && !isPreparingMic && interimTranscript && ( // Show interim even if not actively listening but processing final
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
          disabled={isListening || isSpeakingTTS || isPreparingMic || responseOptions.length === 0}
        />
        <div className="flex justify-center">
          <MicrophoneButton
            isListening={isListening}
            isPreparing={isPreparingMic}
            onClick={toggleListening}
            disabled={!isMicSetupComplete || (micError !== null && !speechRecognitionRef.current) || isProcessingAI || isSpeakingTTS}
          />
        </div>
      </footer>
    </div>
  );
}
