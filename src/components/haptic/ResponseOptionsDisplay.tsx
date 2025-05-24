import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';

interface ResponseOptionsDisplayProps {
  options: string[];
  isLoading: boolean;
  onSelect: (option: string) => void;
  disabled: boolean;
}

const ResponseOptionsDisplay: FC<ResponseOptionsDisplayProps> = ({ options, isLoading, onSelect, disabled }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (options.length === 0) {
    return <div className="min-h-[64px] sm:min-h-[64px]"></div>; // Placeholder for height consistency
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
      {options.map((option, index) => (
        <Button
          key={index}
          variant="outline"
          size="lg"
          className="h-auto min-h-16 py-3 text-sm sm:text-base whitespace-normal text-left justify-start bg-card hover:bg-accent hover:text-accent-foreground focus-visible:ring-accent shadow-sm border-accent border-opacity-50"
          onClick={() => onSelect(option)}
          disabled={disabled}
          aria-label={`Select response: ${option}`}
        >
          <Send size={18} className="mr-2 flex-shrink-0 text-accent group-hover:text-accent-foreground" />
          {option}
        </Button>
      ))}
    </div>
  );
};

export default ResponseOptionsDisplay;
