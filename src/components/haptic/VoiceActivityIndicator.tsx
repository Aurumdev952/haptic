
import type { FC } from 'react';

interface VoiceActivityIndicatorProps {
  isActive: boolean;
}

const VoiceActivityIndicator: FC<VoiceActivityIndicatorProps> = ({ isActive }) => {
  if (!isActive) {
    return null;
  }

  return (
    <div className="flex items-end justify-center space-x-1 h-8" aria-hidden="true">
      <span className="voice-bar bar-1 w-1.5 bg-primary rounded-full"></span>
      <span className="voice-bar bar-2 w-1.5 bg-primary rounded-full"></span>
      <span className="voice-bar bar-3 w-1.5 bg-primary rounded-full"></span>
      <span className="voice-bar bar-4 w-1.5 bg-primary rounded-full"></span>
      <span className="voice-bar bar-5 w-1.5 bg-primary rounded-full"></span>
    </div>
  );
};

export default VoiceActivityIndicator;
