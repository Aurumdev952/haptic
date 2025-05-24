import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, LoaderCircle } from 'lucide-react';

interface MicrophoneButtonProps {
  isListening: boolean;
  isPreparing: boolean; // New prop for initial loading/permission state
  onClick: () => void;
  disabled?: boolean;
}

const MicrophoneButton: FC<MicrophoneButtonProps> = ({ isListening, isPreparing, onClick, disabled }) => {
  return (
    <Button
      variant="default"
      size="icon"
      className="w-16 h-16 rounded-full text-2xl shadow-lg bg-primary hover:bg-primary/90 data-[active=true]:bg-destructive data-[active=true]:hover:bg-destructive/90 transition-all duration-150 ease-in-out"
      onClick={onClick}
      disabled={disabled || isPreparing}
      data-active={isListening}
      aria-label={isListening ? 'Stop listening' : 'Start listening'}
    >
      {isPreparing ? (
        <LoaderCircle size={32} className="animate-spin" />
      ) : isListening ? (
        <MicOff size={32} />
      ) : (
        <Mic size={32} />
      )}
    </Button>
  );
};

export default MicrophoneButton;
