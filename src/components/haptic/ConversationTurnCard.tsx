import type { FC } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConversationTurn {
  id: string;
  userText: string;
  aiResponse?: string;
  timestamp: Date;
  isProcessingAI?: boolean;
}

interface ConversationTurnCardProps {
  turn: ConversationTurn;
}

const ConversationTurnCard: FC<ConversationTurnCardProps> = ({ turn }) => {
  return (
    <div className="mb-4 space-y-3">
      {/* User Message */}
      <div className="flex items-start gap-3 justify-end">
        <Card className="max-w-xs sm:max-w-md md:max-w-lg bg-primary text-primary-foreground rounded-xl rounded-br-none shadow-md">
          <CardContent className="p-3 text-sm">
            <p>{turn.userText}</p>
          </CardContent>
        </Card>
        <div className="flex-shrink-0 p-2 bg-primary text-primary-foreground rounded-full">
          <User size={18} />
        </div>
      </div>

      {/* AI Message or Loading */}
      {turn.isProcessingAI && !turn.aiResponse && (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2 bg-accent text-accent-foreground rounded-full">
            <Bot size={18} />
          </div>
          <Card className="max-w-xs sm:max-w-md md:max-w-lg bg-card text-card-foreground rounded-xl rounded-bl-none shadow-md">
            <CardContent className="p-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-0"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-200"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-400"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {turn.aiResponse && (
         <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2 bg-accent text-accent-foreground rounded-full">
            <Bot size={18} />
          </div>
          <Card className="max-w-xs sm:max-w-md md:max-w-lg bg-card text-card-foreground rounded-xl rounded-bl-none shadow-md">
            <CardContent className="p-3 text-sm">
              <p>{turn.aiResponse}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConversationTurnCard;
