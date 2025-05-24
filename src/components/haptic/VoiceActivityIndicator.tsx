
import type { FC } from 'react';

interface VoiceActivityIndicatorProps {
  audioData: number[]; // Array of numbers (0-100) for bar heights
}

const VoiceActivityIndicator: FC<VoiceActivityIndicatorProps> = ({ audioData }) => {
  const numBars = 5;
  const bars = Array.from({ length: numBars }, (_, i) => {
    // Ensure audioData[i] is a number and clamp between a min (e.g., 2%) and max (100%) height.
    const heightPercent = audioData && typeof audioData[i] === 'number' 
      ? Math.max(2, Math.min(100, audioData[i])) 
      : 2; 
    
    return (
      <span
        key={i}
        className="inline-block w-1.5 bg-primary rounded-full transition-all duration-75 ease-out"
        style={{ height: `${heightPercent}%` }}
      ></span>
    );
  });

  return (
    <div className="flex items-end justify-center space-x-1 h-8" aria-hidden="true">
      {bars}
    </div>
  );
};

export default VoiceActivityIndicator;
