import React, { createContext, useContext, useState, useEffect } from 'react';
import { getChatScheduleStatus, ChatScheduleStatus } from '../lib/chat-schedule.ts';

export interface LotChatContext {
  id: number;
  reference: string;
  title: string;
  image?: string;
  startingPriceCents?: number;
}

interface ChatContextType {
  isOpen: boolean;
  openChat: (lot?: LotChatContext) => void;
  closeChat: () => void;
  toggleChat: () => void;
  lotContext: LotChatContext | null;
  setLotContext: (lot: LotChatContext | null) => void;
  schedule: ChatScheduleStatus;
  refreshSchedule: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lotContext, setLotContext] = useState<LotChatContext | null>(null);
  const [schedule, setSchedule] = useState<ChatScheduleStatus>(getChatScheduleStatus());

  const refreshSchedule = () => {
    setSchedule(getChatScheduleStatus());
  };

  useEffect(() => {
    // Rafraîchir le statut toutes les minutes
    const interval = setInterval(() => {
      refreshSchedule();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const openChat = (lot?: LotChatContext) => {
    if (lot) {
      setLotContext(lot);
    }
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
  };

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        openChat,
        closeChat,
        toggleChat,
        lotContext,
        setLotContext,
        schedule,
        refreshSchedule,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
