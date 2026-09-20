"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"

export default function Page() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  function handleSubmit(message: PromptInputMessage) {
    if (!message.text.trim()) return
    sendMessage({ text: message.text })
  }

  return (
    <div className="mx-auto flex h-svh max-w-2xl flex-col p-6">
      <h1 className="mb-4 text-lg font-medium">రైతు నేస్తం</h1>
      <Conversation className="rounded-lg border">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              title="మీ పంట గురించి ప్రశ్న అడగండి"
              description="తెలుగులో టైప్ చేయండి"
            />
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <MessageResponse key={`${message.id}-${i}`}>
                      {part.text}
                    </MessageResponse>
                  ) : null
                )}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput onSubmit={handleSubmit} className="mt-4">
        <PromptInputTextarea
          placeholder="తెలుగులో టైప్ చేయండి..."
          disabled={status !== "ready"}
        />
        <PromptInputFooter>
          <PromptInputSubmit className="ml-auto" status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
