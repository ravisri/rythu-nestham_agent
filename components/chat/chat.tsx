"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  CameraIcon,
  MicIcon,
  MoonIcon,
  SproutIcon,
  SunIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
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
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis"
import { compressImage } from "@/lib/image"
import { HelpDialog } from "./help-dialog"
import { ListeningCard } from "./listening-card"
import { Actions, Sources } from "./message-extras"
import { Welcome } from "./welcome"

const transport = new DefaultChatTransport({ api: "/api/chat" })
const IMAGE_ONLY_TEXT = "ఈ ఫోటో చూసి సమస్య, పరిష్కారం చెప్పండి."
const GENERIC_ERROR = "క్షమించండి, సమస్య వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి."

type FileInput = { url: string; filename?: string }
type ToolPart = { type: string; state?: string; output?: unknown }

const textOf = (message: UIMessage) =>
  message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim()

const toolPart = (message: UIMessage) =>
  message.parts.find((p) => p.type === "tool-queryCropKnowledgeBase") as
    | ToolPart
    | undefined

function sourcesOf(message: UIMessage): string[] {
  const tool = toolPart(message)
  if (tool?.state !== "output-available") return []
  const results = (tool.output as { results?: { source?: string }[] }).results
  return [...new Set((results ?? []).flatMap((r) => (r.source ? [r.source] : [])))]
}

function progressLabel(last: UIMessage | undefined): string {
  if (last?.role !== "assistant") return "ఆలోచిస్తున్నాను…"
  const tool = toolPart(last)
  if (!tool) return "ఆలోచిస్తున్నాను…"
  return tool.state === "output-available"
    ? "సమాధానం సిద్ధం చేస్తోంది…"
    : "ANGRAU / ICAR లో వెతుకుతోంది…"
}

function ChatInner() {
  const { messages, sendMessage, status, error, stop } = useChat({ transport })
  const controller = usePromptInputController()
  const attachments = usePromptInputAttachments()
  const { supported: canSpeak, speakingId, speak, stop: stopSpeech } =
    useSpeechSynthesis()
  const { setTheme, resolvedTheme } = useTheme()
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [largeText, setLargeText] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const previousStatus = useRef(status)

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    try {
      setAutoSpeak(localStorage.getItem("autoSpeak") !== "off")
      setLargeText(localStorage.getItem("textSize") === "large")
    } catch {}
  }, [])

  useEffect(() => {
    const finished = previousStatus.current !== "ready" && status === "ready"
    previousStatus.current = status
    if (!finished || !autoSpeak || !canSpeak) return
    const last = messages[messages.length - 1]
    const text = last?.role === "assistant" ? textOf(last) : ""
    if (text) speak(last.id, text)
  }, [status, messages, autoSpeak, canSpeak, speak])

  async function send(text: string, files: FileInput[] = []) {
    if (busy || (!text.trim() && files.length === 0)) return
    stopSpeech()
    setNotice(null)
    const compressed = await Promise.all(
      files.map(async (f) => ({
        type: "file" as const,
        mediaType: "image/jpeg",
        filename: f.filename,
        url: await compressImage(f.url),
      }))
    )
    await sendMessage({
      text: text.trim() || IMAGE_ONLY_TEXT,
      files: compressed,
    })
  }

  const mic = useSpeechRecognition({
    onInterim: (text) => controller.textInput.setInput(text),
    onFinal: (text) => {
      controller.textInput.clear()
      const files = [...attachments.files]
      void send(text, files).then(() => attachments.clear())
    },
  })

  function handleSubmit(message: PromptInputMessage) {
    return send(message.text, message.files)
  }

  function remember(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {}
  }

  function toggleAutoSpeak() {
    const next = !autoSpeak
    setAutoSpeak(next)
    if (!next) stopSpeech()
    remember("autoSpeak", next ? "on" : "off")
  }

  function toggleTextSize() {
    setLargeText(!largeText)
    remember("textSize", largeText ? "normal" : "large")
  }

  const last = messages[messages.length - 1]
  const showProgress =
    status === "submitted" ||
    (status === "streaming" && last?.role === "assistant" && !textOf(last))

  const micNotice =
    mic.error === "not-allowed"
      ? "మైక్రోఫోన్ అనుమతి ఇవ్వండి."
      : mic.error === "no-speech"
        ? "మాట వినపడలేదు. మళ్లీ ప్రయత్నించండి."
        : mic.error
          ? "మైక్ పనిచేయడం లేదు. టైప్ చేయండి."
          : null
  const errorText = error
    ? /[ఀ-౿]/.test(error.message)
      ? error.message
      : GENERIC_ERROR
    : null
  const alertText = notice ?? micNotice ?? errorText
  const bodySize = largeText ? "text-xl" : "text-base"

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <SproutIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold">రైతు నేస్తం</h1>
          <p className="truncate text-sm text-muted-foreground">
            పంట సమస్యకు సులభ పరిష్కారం
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <HelpDialog />
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-xl text-base font-semibold"
            aria-label="అక్షరాల పరిమాణం"
            aria-pressed={largeText}
            onClick={toggleTextSize}
          >
            A+
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-xl"
            aria-label="లైట్ / డార్క్"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <SunIcon className="hidden dark:block" />
            <MoonIcon className="dark:hidden" />
          </Button>
          {canSpeak && (
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
              aria-label={autoSpeak ? "వాయిస్ ఆఫ్" : "వాయిస్ ఆన్"}
              onClick={toggleAutoSpeak}
            >
              {autoSpeak ? <Volume2Icon /> : <VolumeXIcon />}
            </Button>
          )}
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="gap-6">
          {messages.length === 0 ? (
            <ConversationEmptyState className="justify-start p-0">
              <Welcome
                micSupported={mic.supported}
                onMic={mic.start}
                onCamera={() => attachments.openFileDialog()}
                onPick={(text) => void send(text)}
              />
            </ConversationEmptyState>
          ) : (
            messages.map((message, index) => {
              const text = textOf(message)
              const images = message.parts.flatMap((p) =>
                p.type === "file" && p.mediaType.startsWith("image/") ? [p] : []
              )
              if (!text && images.length === 0) return null
              const isUser = message.role === "user"

              const content = (
                <Message from={message.role} className="max-w-full">
                  <MessageContent
                    className={`${bodySize} leading-relaxed group-[.is-user]:rounded-2xl group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:bg-card group-[.is-assistant]:px-4 group-[.is-assistant]:py-3`}
                  >
                    {images.map((image, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={image.url}
                        alt="పంట ఫోటో"
                        className="max-h-48 rounded-xl object-cover"
                      />
                    ))}
                    {isUser ? (
                      text && <p>{text}</p>
                    ) : (
                      <MessageResponse
                        isAnimating={busy && index === messages.length - 1}
                      >
                        {text}
                      </MessageResponse>
                    )}
                  </MessageContent>
                </Message>
              )

              if (isUser) return <div key={message.id}>{content}</div>
              return (
                <div key={message.id} className="flex items-start gap-2">
                  <Avatar className="mt-1 size-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <SproutIcon className="size-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-2">
                    {content}
                    <Sources sources={sourcesOf(message)} />
                    <Actions
                      text={text}
                      canSpeak={canSpeak}
                      speaking={speakingId === message.id}
                      onSpeak={() => speak(message.id, text)}
                      onStop={stopSpeech}
                    />
                  </div>
                </div>
              )
            })
          )}
          {showProgress && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner /> {progressLabel(last)}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {alertText && (
          <Alert variant="destructive">
            <AlertDescription>{alertText}</AlertDescription>
          </Alert>
        )}
        {mic.listening && (
          <ListeningCard
            transcript={controller.textInput.value}
            onStop={mic.stop}
          />
        )}
        <PromptInput
          onSubmit={handleSubmit}
          accept="image/*"
          maxFiles={1}
          maxFileSize={10 * 1024 * 1024}
          onError={() => setNotice("ఒక ఫోటో మాత్రమే (10MB లోపు) పంపండి.")}
          className="rounded-2xl"
        >
          {attachments.files.length > 0 && (
            <PromptInputHeader>
              {attachments.files.map((file) => (
                <div key={file.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
                    alt="ఎంచుకున్న ఫోటో"
                    className="size-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    aria-label="ఫోటో తొలగించు"
                    onClick={() => attachments.remove(file.id)}
                    className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border bg-background"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </PromptInputHeader>
          )}
          <PromptInputTextarea
            placeholder="తెలుగులో టైప్ చేయండి…"
            className={`min-h-14 ${bodySize}`}
            disabled={busy}
          />
          <PromptInputFooter>
            <PromptInputTools className="gap-2">
              <PromptInputButton
                variant="secondary"
                size="sm"
                className="h-14 w-20 flex-col gap-1 rounded-xl text-sm"
                disabled={busy}
                onClick={() => attachments.openFileDialog()}
              >
                <CameraIcon className="size-6" />
                <span>ఫోటో</span>
              </PromptInputButton>
              {mic.supported && (
                <PromptInputButton
                  variant={mic.listening ? "destructive" : "secondary"}
                  size="sm"
                  className="h-14 w-20 flex-col gap-1 rounded-xl text-sm"
                  disabled={busy}
                  onClick={mic.listening ? mic.stop : mic.start}
                >
                  <MicIcon className="size-6" />
                  <span>{mic.listening ? "ఆపండి" : "మాట్లాడండి"}</span>
                </PromptInputButton>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              onStop={stop}
              className="size-14 rounded-xl"
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="text-center text-xs text-muted-foreground">
          AI సలహా మాత్రమే. మందులు వాడే ముందు స్థానిక వ్యవసాయ అధికారిని సంప్రదించండి.
        </p>
      </div>
    </div>
  )
}

export function Chat() {
  return (
    <PromptInputProvider>
      <ChatInner />
    </PromptInputProvider>
  )
}
