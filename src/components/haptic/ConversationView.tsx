import type { FC } from 'react';
import type { ConversationTurn } from './ConversationTurnCard';
import ConversationTurnCard from './ConversationTurnCard';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConversationViewProps {
  conversation: ConversationTurn[];
}

const ConversationView: FC<ConversationViewProps> = ({ conversation }) => {
  if (conversation.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <p className="text-muted-foreground">No conversation yet. Tap the microphone to begin.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full pr-4">
      {conversation.map((turn) => (
        <ConversationTurnCard key={turn.id} turn={turn} />
      ))}
    </ScrollArea>
  );
};

export default ConversationView;
