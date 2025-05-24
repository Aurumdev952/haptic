
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConversationTurn } from '@/components/haptic/ConversationTurnCard';
import ConversationView from '@/components/haptic/ConversationView';
import ResponseOptionsDisplay from '@/components/haptic/ResponseOptionsDisplay';
import MicrophoneButton from '@/components/haptic/MicrophoneButton';
import { generateResponseOptions } from '@/ai/flows/generate-response-options';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// SpeechRecognition type definition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
  }
}
type SpeechRecognition = any; // Use 'any' for broader compatibility, specific type below if needed

export default function HapticPage() {
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [responseOptions, setResponseOptions] = useState<string[]>([]);
  
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPreparingMic, setIsPreparingMic] = useState<boolean>(false); // For initial mic setup
  const [isProcessingAI, setIsProcessingAI] = useState<boolean>(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<boolean>(false);
  
  const [micError, setMicError] = useState<string | null>(null);
  const [isMicSetupComplete, setIsMicSetupComplete] = useState<boolean>(false); // New state

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const conversationEndRef = useRef<HTMLDivElement>(null); // For scrolling

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
      setIsListening(false);
      setIsPreparingMic(false);
    } else {
      // Clear previous errors and set preparing state
      setMicError(null);
      setIsPreparingMic(true);
      try {
        speechRecognitionRef.current.start();
        // onstart will set isListening to true and isPreparingMic to false
      } catch (error) {
        console.error("Error starting recognition:", error);
        const errorMsg = "Failed to start microphone. Please check permissions and hardware.";
        setMicError(errorMsg);
        toast({ variant: 'destructive', title: 'Microphone Error', description: errorMsg });
        setIsPreparingMic(false);
      }
    }
  }, [isListening, toast]); // Dependencies: isListening, speechRecognitionRef (implicit via .current), setMicError, toast, setIsPreparingMic

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMicError("Speech recognition is not supported by your browser. Try Chrome or Edge.");
      setIsMicSetupComplete(true); // Mark setup as "complete" even if it failed, to allow other logic to proceed.
      return;
    }
    
    if (!speechRecognitionRef.current) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        const recognition = speechRecognitionRef.current!;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'rw-RW'; // Kinyarwanda. Can be 'sw-SW' for Kiswahili.

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
            setResponseOptions([]); 
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
          // If recognition stops and it wasn't intentional (e.g. toggleListening was not called to stop it),
          // update isListening state.
          // This can happen if speech recognition stops due to an error or prolonged silence.
          if (isListening && speechRecognitionRef.current) {
            // Check if stop was manually triggered. If not, it might be an unexpected stop.
            // For now, direct stop calls handle setIsListening.
            // This ensures that if it stops for other reasons, isListening is false.
            // setIsListening(false); // This might be too aggressive, let toggleListening manage it mostly
          }
        };
        setIsMicSetupComplete(true); // Mark setup as complete
    }
    
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [processTranscription, toast, isListening]);


  // Effect to auto-start microphone when page loads
  useEffect(() => {
    if (isMicSetupComplete && speechRecognitionRef.current && !isListening && !isPreparingMic && !micError) {
      toggleListening();
    }
  }, [isMicSetupComplete, isListening, isPreparingMic, micError, toggleListening]);


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

      <div className="px-4 md:px-6 pb-2 min-h-[40px] text-center">
        {isListening && interimTranscript && <p className="italic text-muted-foreground">{interimTranscript}</p>}
        {isListening && !interimTranscript && !isPreparingMic && <p className="italic text-muted-foreground">Listening...</p>}
        {isPreparingMic && <p className="italic text-muted-foreground">Preparing microphone...</p>}
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
            disabled={!isMicSetupComplete || (micError !== null && !speechRecognitionRef.current)}
          />
        </div>
      </footer>
    </div>
  );
}
