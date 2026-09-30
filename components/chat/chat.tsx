"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  CameraIcon,
  MicIcon,
  MoonIcon,
  ShieldIcon,
  SproutIcon,
  SunIcon,
  Trash2Icon,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis"
import { clearChat, loadChat, saveChat } from "@/lib/chat-history"
import { compressImage } from "@/lib/image"
import { MESSAGES, type Usage } from "@/lib/plans"
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

// The model sometimes writes "... **పరిష్కారం:** - a - b **జాగ్రత్త:** ..." on
// one line: start each section label on its own paragraph.
const formatAnswer = (text: string) =>
  text
    .replace(/[ \t]*(\*\*(?:సమస్య|పరిష్కారం|జాగ్రత్త):?\*\*:?)/g, "\n\n$1")
    .trim()

// Styles per rendered HTML tag inside the answer card.
const ANSWER_STYLES = [
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6",
  "[&_ol]:my-2 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6",
  "[&_li]:pl-1 [&_li]:marker:text-primary [&_li>p]:my-0",
  "[&_strong]:font-semibold [&_strong]:text-primary",
].join(" ")

const toolPart = (message: UIMessage) =>
  message.parts.find((p) => p.type === "tool-queryCropKnowledgeBase") as
    ToolPart | undefined

type Source = { source?: string; pages?: string }
// Sent by /api/chat with each reply.
type ReplyMeta = { left?: number; sources?: Source[] }

// Pre-searched reference (metadata) + any extra search the model made (tool).
function sourcesOf(message: UIMessage): string[] {
  const tool = toolPart(message)
  const searched =
    tool?.state === "output-available"
      ? ((tool.output as { results?: Source[] }).results ?? [])
      : []
  const given = (message.metadata as ReplyMeta | undefined)?.sources ?? []
  const label = (r: Source) =>
    r.pages ? `${r.source} · p. ${r.pages}` : r.source!
  return [
    ...new Set(
      [...given, ...searched].flatMap((r) => (r.source ? [label(r)] : []))
    ),
  ]
}

function progressLabel(last: UIMessage | undefined): string {
  if (last?.role !== "assistant") return "ఆలోచిస్తున్నాను…"
  const tool = toolPart(last)
  if (!tool) return "ఆలోచిస్తున్నాను…"
  return tool.state === "output-available"
    ? "సమాధానం సిద్ధం చేస్తోంది…"
    : "ANGRAU / ICAR లో వెతుకుతోంది…"
}

type ChatProps = { userId: string; isAdmin: boolean; usage: Usage }

function ChatInner({
  userId,
  isAdmin,
  usage,
  initialMessages,
}: ChatProps & { initialMessages: UIMessage[] }) {
  const router = useRouter()
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport,
    messages: initialMessages,
  })
  const [left, setLeft] = useState(usage.left)
  // Messages that came from storage (their credit counts are stale).
  const [loadedCount, setLoadedCount] = useState(initialMessages.length)
  const controller = usePromptInputController()
  const attachments = usePromptInputAttachments()
  const {
    supported: canSpeak,
    speakingId,
    speak,
    stop: stopSpeech,
  } = useSpeechSynthesis()
  const { setTheme, resolvedTheme } = useTheme()
  const [largeText, setLargeText] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    try {
      setLargeText(localStorage.getItem("textSize") === "large")
    } catch {}
  }, [])

  // Save finished conversations to this browser only.
  useEffect(() => {
    if (status === "ready" || status === "error") saveChat(userId, messages)
  }, [status, messages, userId])

  // Credits left from the newest reply (ignore replies loaded from storage).
  useEffect(() => {
    const last = messages[messages.length - 1]
    const meta = last?.metadata as ReplyMeta | undefined
    if (
      messages.length > loadedCount &&
      last.role === "assistant" &&
      typeof meta?.left === "number"
    ) {
      setLeft(meta.left)
    }
  }, [messages, loadedCount])

  // Limit reached -> 0 left; signed in on another phone -> back to login.
  useEffect(() => {
    const limits: string[] = [
      MESSAGES.dailyLimit,
      MESSAGES.periodLimit,
      MESSAGES.trialLimit,
    ]
    if (error && limits.includes(error.message)) setLeft(0)
    if (error?.message === MESSAGES.sessionEnded) {
      const timer = setTimeout(() => router.replace("/login"), 2500)
      return () => clearTimeout(timer)
    }
  }, [error, router])

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

  // Deletes this user's chat from the browser and shows the welcome screen.
  function clearHistory() {
    stopSpeech()
    setNotice(null)
    setMessages([])
    setLoadedCount(0)
    clearChat(userId)
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
    <div className="mx-auto flex h-dvh w-full flex-col bg-muted dark:bg-background">
      <header className="flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <SproutIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold">రైతు నేస్తం</h1>
          <p className="truncate text-sm text-muted-foreground">
            {usage.status === "active"
              ? `${usage.planLabel} · మిగిలిన ప్రశ్నలు: ${left}`
              : usage.status === "trial_over"
                ? "ఉచిత ట్రయల్ ముగిసింది"
                : "ప్లాన్ గడువు ముగిసింది"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAdmin && (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
            >
              <Link href="/admin" aria-label="అడ్మిన్">
                <ShieldIcon />
              </Link>
            </Button>
          )}
          {messages.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-xl"
                  aria-label="చాట్ తొలగించు"
                  disabled={busy}
                >
                  <Trash2Icon />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>చాట్ మొత్తం తొలగించాలా?</DialogTitle>
                  <DialogDescription className="text-base">
                    ఈ ఫోన్‌లో ఉన్న ప్రశ్నలు, సమాధానాలు అన్నీ తొలగిపోతాయి.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-11 text-base">
                      వద్దు
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="destructive"
                      className="h-11 text-base"
                      onClick={clearHistory}
                    >
                      <Trash2Icon />
                      తొలగించు
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
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
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <SunIcon className="hidden dark:block" />
            <MoonIcon className="dark:hidden" />
          </Button>
        </div>
      </header>

      <Conversation className="flex-1 max-w-5xl mx-auto w-full">
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
                    className={`${bodySize} leading-relaxed group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:bg-card group-[.is-assistant]:px-4 group-[.is-assistant]:py-3 group-[.is-user]:rounded-2xl group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground`}
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
                        className={ANSWER_STYLES}
                      >
                        {formatAnswer(text)}
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
          className="rounded-2xl max-w-5xl mx-auto"
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
          AI సలహా మాత్రమే. మందులు వాడే ముందు స్థానిక వ్యవసాయ అధికారిని
          సంప్రదించండి.
        </p>
      </div>
    </div>
  )
}

export function Chat(props: ChatProps) {
  // localStorage is browser-only: load it before useChat mounts.
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null
  )
  useEffect(() => {
    setInitialMessages(loadChat(props.userId))
  }, [props.userId])

  if (!initialMessages) {
    return <div className="h-dvh bg-muted dark:bg-background" />
  }
  return (
    <PromptInputProvider>
      <ChatInner {...props} initialMessages={initialMessages} />
    </PromptInputProvider>
  )
}
