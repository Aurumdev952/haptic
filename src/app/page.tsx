"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ConversationTurn } from "@/components/haptic/ConversationTurnCard";
// import ConversationView from "@/components/haptic/ConversationView"; // Not used in the provided snippet
import ResponseOptionsDisplay, {
  type ResponseOption,
} from "@/components/haptic/ResponseOptionsDisplay";
import MicrophoneButton from "@/components/haptic/MicrophoneButton";
import VoiceActivityIndicator from "@/components/haptic/VoiceActivityIndicator";
import { generateResponseOptions } from "@/ai/flows/generate-response-options";
import { useToast } from "@/hooks/use-toast";
// import { AlertCircle } from "lucide-react"; // Not used directly in the provided snippet's render
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Not used directly in the provided snippet's render
import CircularGradient from "@/components/CircularGradient";
import Image from "next/image";
import { HapticLogo } from "@/assets/assetsExporter";

// SpeechRecognition type definition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
    webkitAudioContext: typeof AudioContext | undefined;
  }
  // For event types
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }
}
type SpeechRecognition = any;

const PREPARING_TIMEOUT_DURATION = 10000; // 10 seconds
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts"; // As per your curl example
const OPENAI_TTS_VOICE = "alloy"; // As per your curl example

export default function HapticPage() {
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [responseOptions, setResponseOptions] = useState<ResponseOption[]>([]);

  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPreparingMic, setIsPreparingMic] = useState<boolean>(false);
  const [isProcessingAI, setIsProcessingAI] = useState<boolean>(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<boolean>(false);

  const [micError, setMicError] = useState<string | null>(null);
  const [isMicSetupComplete, setIsMicSetupComplete] = useState<boolean>(false);
  const userClickedStop = useRef<boolean>(false);

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

  const [voiceActivityData, setVoiceActivityData] = useState<number[]>([
    0, 0, 0, 0, 0,
  ]);

  // Refs for OpenAI TTS
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);


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

  const attemptStartListeningRef = useRef<() => void>(() => {});
  const processTranscriptionRef = useRef<(transcript: string) => Promise<void>>(
    async () => {}
  );
  const micErrorRef = useRef(micError);
  const userClickedStopValRef = useRef(userClickedStop.current);

  useEffect(() => {
    micErrorRef.current = micError;
  }, [micError]);
  useEffect(() => {
    userClickedStopValRef.current = userClickedStop.current;
  }, [userClickedStop.current]);

  const attemptStartListening = useCallback(() => {
    if (typeof window === "undefined" || !speechRecognitionRef.current) {
      const errorMsg =
        "Speech recognition is not available or not initialized.";
      setMicError(errorMsg);
      toast({ variant: "destructive", title: "Error", description: errorMsg });
      setIsPreparingMic(false);
      setIsListening(false);
      userClickedStop.current = true;
      return;
    }

    if (isListening || isPreparingMic) {
      console.log(
        "AttemptStartListening: Already listening or preparing, skipping."
      );
      return;
    }

    clearPreparingMicTimeout();
    userClickedStop.current = false;
    setMicError(null);
    setIsPreparingMic(true);
    console.log("AttemptStartListening: Set isPreparingMic = true");

    preparingTimeoutIdRef.current = setTimeout(() => {
      const errorMsg =
        "Microphone preparation timed out. Please check permissions or ensure the microphone is working. Try refreshing the page.";
      console.warn(errorMsg);
      setMicError(errorMsg);
      toast({
        variant: "destructive",
        title: "Microphone Timeout",
        description: errorMsg,
      });
      setIsPreparingMic(false);
      setIsListening(false);
      userClickedStop.current = true;
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          console.warn("Error stopping recognition on timeout:", e);
        }
      }
    }, PREPARING_TIMEOUT_DURATION);

    try {
      console.log(
        "AttemptStartListening: Calling speechRecognitionRef.current.start()"
      );
      speechRecognitionRef.current.start();
    } catch (error: any) {
      console.error(
        "Error starting recognition in attemptStartListening:",
        error
      );
      clearPreparingMicTimeout();
      const errorMsg = `Failed to start microphone: ${
        error.message || "Check permissions and hardware."
      }`;
      setMicError(errorMsg);
      toast({
        variant: "destructive",
        title: "Microphone Error",
        description: errorMsg,
      });
      setIsPreparingMic(false);
      setIsListening(false);
      userClickedStop.current = true;
    }
  }, [isListening, isPreparingMic, toast, clearPreparingMicTimeout]);

  const processTranscription = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;

      const newTurnId = Date.now().toString();
      setConversation((prev) => [
        ...prev,
        {
          id: newTurnId,
          userText: transcript,
          timestamp: new Date(),
          isProcessingAI: true,
        },
      ]);
      setResponseOptions([]);
      setIsProcessingAI(true);

      try {
        const result = await generateResponseOptions({
          transcribedInput: transcript,
        });
        setResponseOptions(result.responseOptions);
        setConversation((prev) =>
          prev.map((turn) =>
            turn.id === newTurnId ? { ...turn, isProcessingAI: false } : turn
          )
        );
      } catch (error) {
        console.error("Error generating AI responses:", error);
        toast({
          variant: "destructive",
          title: "AI Error",
          description: "Could not generate response options.",
        });
        setConversation((prev) =>
          prev.map((turn) =>
            turn.id === newTurnId
              ? {
                  ...turn,
                  isProcessingAI: false,
                  aiResponse: "[Error fetching responses]",
                }
              : turn
          )
        );
      } finally {
        setIsProcessingAI(false);
        if (
          speechRecognitionRef.current &&
          !userClickedStopValRef.current &&
          !micErrorRef.current &&
          !isListening &&
          !isPreparingMic
        ) {
          console.log("ProcessTranscription: Attempting to restart listening.");
          attemptStartListeningRef.current();
        }
      }
    },
    [toast, isListening, isPreparingMic] // Removed attemptStartListeningRef from dependencies as it's stable via its own effect
  );

  useEffect(() => {
    attemptStartListeningRef.current = attemptStartListening;
  }, [attemptStartListening]);
  useEffect(() => {
    processTranscriptionRef.current = processTranscription;
  }, [processTranscription]);

  const stopListening = useCallback(() => {
    if (typeof window === "undefined" || !speechRecognitionRef.current) return;

    userClickedStop.current = true;
    clearPreparingMicTimeout();
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
        console.log(
          "StopListening: Called speechRecognitionRef.current.stop()"
        );
      } catch (e) {
        console.warn("Error stopping recognition in stopListening:", e);
      }
    }
  }, [clearPreparingMicTimeout]);

  const handleMicButtonClick = useCallback(() => {
    if (isListening || isPreparingMic) {
      stopListening();
    } else {
      userClickedStop.current = false;
      attemptStartListeningRef.current();
    }
  }, [isListening, isPreparingMic, stopListening]); // Removed attemptStartListeningRef

  const stopCurrentTTS = () => {
    if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0; // Reset time
      // Detach event handlers to prevent them from firing on manual stop
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      console.log("OpenAI TTS stopped.");
    }
    // Ensure state is consistent
    if (isSpeakingTTS) {
      setIsSpeakingTTS(false);
    }
  };


  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setMicError(
        "Speech recognition is not supported by your browser. Try Chrome or Edge."
      );
      setIsMicSetupComplete(true);
      userClickedStop.current = true;
      return;
    }

    if (!speechRecognitionRef.current) {
      speechRecognitionRef.current = new SpeechRecognitionAPI();
      const recognition = speechRecognitionRef.current!;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "rw-RW"; // Or your desired STT language

      recognition.onstart = () => {
        console.log("Recognition.onstart fired");
        clearPreparingMicTimeout();
        setIsListening(true);
        setIsPreparingMic(false);
        setMicError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        console.log("Recognition.onresult fired");
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setInterimTranscript(interim);

        if (final.trim()) {
          // If new speech is detected while OpenAI TTS is playing, stop it.
          stopCurrentTTS();
          processTranscriptionRef.current(final.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearPreparingMicTimeout();
        console.error("Speech recognition error:", event.error, event.message);
        let errorMsg = `An unknown microphone error occurred: ${event.error}.`;
        let criticalError = false;
        if (event.error === "no-speech") {
          errorMsg =
            "No speech was detected. Please ensure your microphone is working and try speaking clearly.";
        } else if (event.error === "audio-capture") {
          errorMsg =
            "Audio capture failed. Is a microphone connected and enabled? Please check system settings.";
          criticalError = true;
        } else if (event.error === "not-allowed") {
          errorMsg =
            "Microphone access was denied. Please enable microphone permissions in your browser settings for this site.";
          criticalError = true;
        } else if (event.error === "network") {
          errorMsg =
            "A network error occurred with the speech recognition service. Check your internet connection.";
        } else if (event.error === "language-not-supported") {
          errorMsg = `The selected language for STT (${recognition.lang}) is not supported by your browser/OS speech recognition service.`;
          criticalError = true;
        } else if (
          event.error === "service-not-allowed" ||
          event.error === "aborted"
        ) {
          errorMsg = `Speech recognition service error: ${event.error}. It might be temporary.`;
          if (event.error === "aborted" && !userClickedStopValRef.current) {
            // Aborted by service, not user - might not be critical for auto-restart
          } else {
            criticalError = true;
          }
        }

        setMicError(errorMsg);
        toast({
          variant: "destructive",
          title: "Microphone Error",
          description: errorMsg,
        });
        setIsListening(false);
        setIsPreparingMic(false);
        if (criticalError) {
          userClickedStop.current = true;
        }
      };

      recognition.onend = () => {
        console.log(
          "Recognition.onend fired. userClickedStop:",
          userClickedStopValRef.current,
          "micError:",
          micErrorRef.current
        );
        clearPreparingMicTimeout();
        setIsListening(false);
        setIsPreparingMic(false);

        if (!userClickedStopValRef.current && !micErrorRef.current && !isSpeakingTTS) { // Added !isSpeakingTTS check
          console.log(
            "Recognition.onend: Conditions met, attempting to restart listening."
          );
          attemptStartListeningRef.current();
        } else {
          console.log("Recognition.onend: Conditions NOT met for restart (user stop, mic error, or TTS active).");
        }
      };
      setIsMicSetupComplete(true);
    }

    return () => {
      console.log("HapticPage cleanup: Main useEffect returning.");
      clearPreparingMicTimeout();
      if (speechRecognitionRef.current) {
        const rec = speechRecognitionRef.current;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
          console.log(
            "Speech recognition instance aborted on component unmount / effect re-run."
          );
        } catch (e) {
          console.warn(
            "Error aborting recognition on unmount / effect re-run:",
            e
          );
        }
      }
      // Cleanup OpenAI TTS audio player
      stopCurrentTTS();
      if (audioPlayerRef.current) {
        audioPlayerRef.current = null; // Release the audio element
      }
    };
  }, [clearPreparingMicTimeout, toast, isSpeakingTTS]); // Added isSpeakingTTS as it affects onend logic

  useEffect(() => {
    if (
      isMicSetupComplete &&
      !isListening &&
      !isPreparingMic &&
      !micErrorRef.current &&
      !userClickedStopValRef.current &&
      !isSpeakingTTS // Don't auto-start if TTS is about to play or playing
    ) {
      console.log(
        "Initial mic start useEffect: conditions met, attempting to start listening."
      );
      attemptStartListeningRef.current();
    }
  }, [isMicSetupComplete, isListening, isPreparingMic, isSpeakingTTS]); // Added isSpeakingTTS


  useEffect(() => {
    const NUM_BARS = 5;
    const processAudioFrame = () => {
      if (
        analyserRef.current &&
        audioDataArrayRef.current &&
        audioContextRef.current?.state === "running"
      ) {
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
      if (
        typeof window === "undefined" ||
        audioContextRef.current ||
        !isListening
      )
        return;
      if (
        micErrorRef.current &&
        (micErrorRef.current.includes("denied") ||
          micErrorRef.current.includes("capture failed"))
      )
        return;

      try {
        if (
          !microphoneStreamRef.current ||
          microphoneStreamRef.current
            .getAudioTracks()
            .every((t) => t.readyState === "ended")
        ) {
          microphoneStreamRef.current =
            await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const AudioContextAPI =
          window.AudioContext || window.webkitAudioContext;
        if (!AudioContextAPI) {
          return;
        }

        audioContextRef.current = new AudioContextAPI();
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }

        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        mediaStreamSourceRef.current =
          audioContextRef.current.createMediaStreamSource(
            microphoneStreamRef.current
          );
        mediaStreamSourceRef.current.connect(analyserRef.current);
        audioDataArrayRef.current = new Uint8Array(
          analyserRef.current.frequencyBinCount
        );
        animationFrameIdRef.current = requestAnimationFrame(processAudioFrame);
        console.log("Audio visualizer initialized");
      } catch (err) {
        console.warn("Could not initialize audio visualizer:", err);
      }
    };

    const cleanupAudioVisualizer = () => {
      if (animationFrameIdRef.current)
        cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;

      if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
      }
      analyserRef.current = null;

      if (microphoneStreamRef.current) {
        microphoneStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        microphoneStreamRef.current = null;
        console.log("Visualizer microphone stream stopped.");
      }

      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current
          .close()
          .then(() => {
            console.log("Visualizer audio context closed.");
            audioContextRef.current = null;
          })
          .catch((e) =>
            console.warn("Error closing visualizer audio context:", e)
          );
      } else {
        audioContextRef.current = null;
      }
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
  }, [isListening, isPreparingMic]);

  const handleSelectResponse = async (option: ResponseOption) => {
    if (typeof window === "undefined") return;
    setInterimTranscript("");
    stopCurrentTTS(); // Stop any currently playing TTS

    setIsSpeakingTTS(true);

    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OpenAI API key not found.");
      toast({
        variant: "destructive",
        title: "TTS Configuration Error",
        description: "OpenAI API key is missing.",
      });
      setIsSpeakingTTS(false);
      // Attempt to restart listening even on config error
      if (!userClickedStopValRef.current && !micErrorRef.current && !isListening && !isPreparingMic) {
        attemptStartListeningRef.current();
      }
      return;
    }

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_TTS_MODEL,
          input: option.text,
          voice: OPENAI_TTS_VOICE,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("OpenAI TTS API error:", response.status, errorData);
        throw new Error(
          `Failed to generate speech: ${response.statusText} ${errorData.error?.message || ""}`
        );
      }

      const audioBlob = await response.blob();

      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }

      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current); // Clean up previous URL
      }

      currentAudioUrlRef.current = URL.createObjectURL(audioBlob);
      audioPlayerRef.current.src = currentAudioUrlRef.current;

      audioPlayerRef.current.onended = () => {
        console.log("OpenAI TTS finished playing.");
        setIsSpeakingTTS(false);
        if (currentAudioUrlRef.current) {
          URL.revokeObjectURL(currentAudioUrlRef.current);
          currentAudioUrlRef.current = null;
        }
        setConversation((prev) => {
          const lastTurnIndex = prev.length - 1;
          if (
            lastTurnIndex >= 0 &&
            prev[lastTurnIndex].userText &&
            !prev[lastTurnIndex].aiResponse
          ) {
            const updatedConversation = [...prev];
            updatedConversation[lastTurnIndex] = {
              ...updatedConversation[lastTurnIndex],
              aiResponse: option.text,
              isProcessingAI: false,
            };
            return updatedConversation;
          }
          return prev;
        });
        if (!userClickedStopValRef.current && !micErrorRef.current && !isListening && !isPreparingMic) {
          console.log("TTS onended: Attempting to restart listening.");
          attemptStartListeningRef.current();
        }
      };

      audioPlayerRef.current.onerror = (e) => {
        console.error("Error playing OpenAI TTS audio:", e);
        toast({
          variant: "destructive",
          title: "TTS Playback Error",
          description: "Could not play the audio response.",
        });
        setIsSpeakingTTS(false);
        if (currentAudioUrlRef.current) {
          URL.revokeObjectURL(currentAudioUrlRef.current);
          currentAudioUrlRef.current = null;
        }
        if (!userClickedStopValRef.current && !micErrorRef.current && !isListening && !isPreparingMic) {
          console.log("TTS onerror (playback): Attempting to restart listening.");
          attemptStartListeningRef.current();
        }
      };

      audioPlayerRef.current.play().catch(err => {
        // This catch is for the play() promise itself, e.g. if user hasn't interacted with the page.
        console.error("Error calling play() on audio element:", err);
        toast({
          variant: "destructive",
          title: "TTS Playback Error",
          description: `Could not start audio playback: ${err.message}. Try interacting with the page first.`,
        });
        setIsSpeakingTTS(false);
        if (currentAudioUrlRef.current) {
          URL.revokeObjectURL(currentAudioUrlRef.current);
          currentAudioUrlRef.current = null;
        }
        if (!userClickedStopValRef.current && !micErrorRef.current && !isListening && !isPreparingMic) {
          attemptStartListeningRef.current();
        }
      });

    } catch (error: any) {
      console.error("Error in handleSelectResponse with OpenAI TTS:", error);
      toast({
        variant: "destructive",
        title: "TTS API Error",
        description: error.message || "Could not generate or play the speech.",
      });
      setIsSpeakingTTS(false);
      if (!userClickedStopValRef.current && !micErrorRef.current && !isListening && !isPreparingMic) {
        console.log("TTS onerror (API): Attempting to restart listening.");
        attemptStartListeningRef.current();
      }
    }
  };


  return (
    <div className="flex flex-col h-screen bg-[#1B1B1C] relative">
      <header className="p-4 shadow-sm">
        <Image
          src={HapticLogo}
          width={100}
          height={100}
          alt="Haptic logo"
        />
      </header>

      {/* Error display can be uncommented if desired
      {micError && (
         <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Microphone Error</AlertTitle>
              <AlertDescription>{micError}</AlertDescription>
            </Alert>
         </div>
      )} */}

      <div className="px-4 md:px-6 pb-2 min-h-[72px] text-center flex flex-col items-center justify-center z-[20]">
        {isPreparingMic && (
          <div className={`bg-[#10141680] px-[20px] py-[15px] rounded-full`}>
            <p className="font-[400] text-[25px] text-[#FFFFFF99]">
              Preparing microphone...
            </p>
          </div>
        )}

        {(isListening || interimTranscript) && !isPreparingMic && (
          <div className={`bg-[#10141680] px-[20px] py-[15px] rounded-full`}>
            {interimTranscript ? (
              <p className="font-[400] text-[25px] text-[#FFFFFF99]">
                {interimTranscript}
              </p>
            ) : (
              <p className="font-[400] text-[25px] text-[#FFFFFF99]">
                Listening
              </p>
            )}
          </div>
        )}

        {!isListening && !isPreparingMic && interimTranscript && (
          <div className="flex flex-col items-center space-y-1">
            {/* This VoiceActivityIndicator might need adjustment as it uses a different mic stream */}
            <VoiceActivityIndicator audioData={[0, 0, 0, 0, 0]} />
            <p className="italic text-muted-foreground">{interimTranscript}</p>
          </div>
        )}
        {/* Placeholder for spacing if none of the above are shown */}
        {!isPreparingMic &&
          !((isListening || interimTranscript) && !isPreparingMic) &&
          !(!isListening && !isPreparingMic && interimTranscript) && (
            <div className="h-[52px]" aria-hidden="true"></div>
          )}
      </div>

      {/* Conversation View (hidden in provided snippet, assuming it's elsewhere or removed) */}
      {/* This div is for scrolling, you might need to integrate ConversationView here */}
      <div ref={conversationEndRef} className="flex-grow overflow-y-auto">
        {/* Example: Render conversation turns if you have them */}
        {/* {conversation.map(turn => <ConversationTurnCard key={turn.id} turn={turn} />)} */}
      </div>


      <main className="flex h-full overflow-y-auto p-4 md:p-6 z-[20]">
        <ResponseOptionsDisplay
          options={responseOptions}
          isLoading={isProcessingAI}
          onSelect={handleSelectResponse}
          disabled={
            isPreparingMic || responseOptions.length === 0 || isProcessingAI || isSpeakingTTS // Added isSpeakingTTS
          }
        />
      </main>

      {/* <footer className="px-4 md:px-6 pb-4 md:pb-6 space-y-4 bg-[#1B1B1C] sticky bottom-0">
        <div className="flex justify-center">
          <MicrophoneButton
            isListening={isListening}
            isPreparing={isPreparingMic}
            onClick={handleMicButtonClick}
            disabled={
              !isMicSetupComplete ||
              (micError !== null &&
                (micError.includes("denied") ||
                  micError.includes("not supported") ||
                  micError.includes("capture failed") ||
                  micError.includes("Audio capture failed"))) ||
              isProcessingAI ||
              isSpeakingTTS
            }
          />
        </div>
      </footer> */}

      <div
        className={`absolute top-[-20rem] left-0 right-0 flex items-center justify-center z-[10]`}
      >
        <CircularGradient isSpeaking={isSpeakingTTS} />
      </div>
    </div>
  );
}
