"use client"

import { useEffect, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  CameraIcon,
  MicIcon,
  SproutIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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
import { ProfileMenu } from "@/components/chat/profile-menu"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import { useI18n } from "@/lib/i18n/client"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis"
import { te as teluguText } from "@/lib/i18n/dictionaries"
import {
  clearChat,
  loadChat,
  markAsked,
  saveChat,
  wasAskedToday,
} from "@/lib/chat-history"
import { compressImage } from "@/lib/image"
import { MESSAGES, type Usage } from "@/lib/plans"
import { useTeluguLexicon } from "@/hooks/use-telugu-lexicon"
import {
  convertLastWord,
  suggest,
  transliterateText,
} from "@/lib/telugu-translit"
import { ListeningCard } from "./listening-card"
import { Actions, Sources } from "./message-extras"
import { Welcome } from "./welcome"

const transport = new DefaultChatTransport({
  api: "/api/chat",
  // The server only uses the last 6 messages and the newest photo (prune() in
  // app/api/chat/route.ts): don't upload older photos again with every question.
  prepareSendMessagesRequest: ({ id, messages, body }) => ({
    body: {
      ...body,
      id,
      messages: messages
        .slice(-6)
        .map((m, i, recent) =>
          i === recent.length - 1
            ? m
            : { ...m, parts: m.parts.filter((p) => p.type !== "file") }
        ),
    },
  }),
})
// Sent to the AI with a photo-only question: always Telugu.
const IMAGE_ONLY_TEXT = "ఈ ఫోటో చూసి సమస్య, పరిష్కారం చెప్పండి."

// Too few Telugu letters = speech wasn't understood (noise, one sound, English).
const unclearSpeech = (text: string) =>
  (text.match(/[ఀ-౿]/g) ?? []).length < 5

type FileInput = { url: string; filename?: string }
type ToolPart = { type: string; state?: string; output?: unknown }

const textOf = (message: UIMessage) =>
  message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim()

// The model sometimes writes "... **పరిష్కారం:** - a - b **జాగ్రత్త:** ..." on
// one line: start each section / option-group label on its own paragraph.
const formatAnswer = (text: string) =>
  text
    .replace(
      /[ \t]*(\*\*(?:సమస్య|పరిష్కారం|జాగ్రత్త|సేంద్రీయ|సాగు పద్ధతులు|రసాయన)[^*\n]*\*\*:?)/g,
      "\n\n$1"
    )
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

function progressLabel(last: UIMessage | undefined, t: Dictionary): string {
  if (last?.role !== "assistant") return t.chat.thinking
  const tool = toolPart(last)
  if (!tool) return t.chat.thinking
  return tool.state === "output-available" ? t.chat.preparing : t.chat.searching
}

type ChatProps = {
  userId: string
  username: string
  isAdmin: boolean
  usage: Usage
}

function ChatInner({
  userId,
  username,
  isAdmin,
  usage,
  initialMessages,
}: ChatProps & { initialMessages: UIMessage[] }) {
  const router = useRouter()
  const { t } = useI18n()
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport,
    messages: initialMessages,
    // Remember answered text questions so a same-day repeat isn't sent again.
    onFinish: ({ message, messages, isError, isAbort, isDisconnect }) => {
      if (isError || isAbort || isDisconnect || message.role !== "assistant")
        return
      const question = messages.findLast((m) => m.role === "user")
      if (question && !question.parts.some((p) => p.type === "file")) {
        markAsked(userId, textOf(question))
      }
    },
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
  const [largeText, setLargeText] = useState(false)
  // English letters -> Telugu while typing (mirchi -> మిర్చి).
  const [teluguTyping, setTeluguTyping] = useState(true)
  // Real Telugu words, so loose spellings become proper words (vache -> వచ్చే).
  const lexicon = useTeluguLexicon(teluguTyping) ?? undefined
  const [notice, setNotice] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    try {
      setLargeText(localStorage.getItem("textSize") === "large")
      setTeluguTyping(localStorage.getItem("teluguTyping") !== "off")
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
    setInfo(null)
    // The last word may have been typed without a space after it.
    const typed = teluguTyping
      ? transliterateText(text.trim(), lexicon)
      : text.trim()
    // Same text question already answered today: no API call, no credit.
    if (files.length === 0 && wasAskedToday(userId, typed)) {
      setInfo(t.chat.askedToday)
      if (canSpeak) speak("asked-today", teluguText.chat.askedToday)
      return
    }
    const compressed = await Promise.all(
      files.map(async (f) => ({
        type: "file" as const,
        mediaType: "image/jpeg",
        filename: f.filename,
        url: await compressImage(f.url),
      }))
    )
    await sendMessage({
      text: typed || IMAGE_ONLY_TEXT,
      files: compressed,
    })
  }

  // Convert the word before a space / Enter / punctuation the user just typed.
  function handleTyping(e: ChangeEvent<HTMLTextAreaElement>) {
    if (!teluguTyping) return
    const textarea = e.currentTarget
    const result = convertLastWord(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
      lexicon
    )
    if (!result) return
    controller.textInput.setInput(result.value)
    requestAnimationFrame(() =>
      textarea.setSelectionRange(result.caret, result.caret)
    )
  }

  // Word being typed at the end of the box -> Telugu choices to tap.
  const typing = teluguTyping
    ? controller.textInput.value.match(/([A-Za-z]+)$/)?.[1]
    : undefined
  const choices = typing ? suggest(typing, lexicon) : []

  function pickChoice(word: string) {
    const value = controller.textInput.value
    controller.textInput.setInput(`${value.slice(0, -typing!.length)}${word} `)
  }

  function toggleTeluguTyping() {
    setTeluguTyping(!teluguTyping)
    remember("teluguTyping", teluguTyping ? "off" : "on")
  }

  const mic = useSpeechRecognition({
    onInterim: (text) => controller.textInput.setInput(text),
    onFinal: (text) => {
      controller.textInput.clear()
      const files = [...attachments.files]
      const unclear = unclearSpeech(text)
      // Unclear voice: ask again instead of spending a credit (a photo still goes).
      if (unclear && files.length === 0) {
        setInfo(t.chat.micNoSpeech)
        if (canSpeak) speak("mic-unclear", teluguText.chat.micNoSpeech)
        return
      }
      void send(unclear ? "" : text, files).then(() => attachments.clear())
    },
  })

  // Silence / no match: also say it aloud (many farmers can't read the alert).
  useEffect(() => {
    if ((mic.error === "no-speech" || mic.error === "no-match") && canSpeak) {
      speak("mic-unclear", teluguText.chat.micNoSpeech)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.error])

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
    setInfo(null)
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
      ? t.chat.micDenied
      : mic.error === "no-speech" || mic.error === "no-match"
        ? t.chat.micNoSpeech
        : mic.error
          ? t.chat.micBroken
          : null
  // Telugu server replies (limits, session) are shown as-is: they are read aloud.
  const errorText = error
    ? /[ఀ-౿]/.test(error.message)
      ? error.message
      : t.chat.genericError
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
          <h1 className="text-lg leading-tight font-semibold">{t.common.appName}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {usage.status === "active"
              ? `${t.plans[usage.plan]} · ${t.chat.left(left)}`
              : usage.status === "trial_over"
                ? t.chat.trialOver
                : t.chat.planExpired}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ProfileMenu
            username={username}
            isAdmin={isAdmin}
            largeText={largeText}
            onToggleTextSize={toggleTextSize}
          />
          {messages.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-xl"
                  aria-label={t.chat.clearChat}
                  disabled={busy}
                >
                  <Trash2Icon />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.chat.clearTitle}</DialogTitle>
                  <DialogDescription className="text-base">
                    {t.chat.clearBody}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-11 text-base">
                      {t.common.cancel}
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="destructive"
                      className="h-11 text-base"
                      onClick={clearHistory}
                    >
                      <Trash2Icon />
                      {t.common.remove}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <Conversation className="flex-1 w-full">
        <ConversationContent className="gap-6 mx-auto max-w-6xl w-full ">
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
                <Message from={message.role} className="max-w-5xl">
                  <MessageContent
                    className={`${bodySize} leading-relaxed group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:bg-card group-[.is-assistant]:px-4 group-[.is-assistant]:py-3 group-[.is-user]:rounded-2xl group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground`}
                  >
                    {images.map((image, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={image.url}
                        alt={t.chat.cropPhoto}
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
              <Spinner /> {progressLabel(last, t)}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}
        {alertText && !info && (
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
          onError={() => setNotice(t.chat.photoLimit)}
          className="rounded-2xl max-w-5xl mx-auto"
        >
          {attachments.files.length > 0 && (
            <PromptInputHeader>
              {attachments.files.map((file) => (
                <div key={file.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
                    alt={t.chat.selectedPhoto}
                    className="size-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t.chat.removePhoto}
                    onClick={() => attachments.remove(file.id)}
                    className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border bg-background"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </PromptInputHeader>
          )}
          {choices.length > 0 && (
            <PromptInputHeader className="flex-wrap gap-1.5">
              {choices.map((word, i) => (
                <Button
                  key={word}
                  type="button"
                  size="sm"
                  variant={i === 0 ? "default" : "secondary"}
                  className="h-9 rounded-full px-3 text-base"
                  // Keep the keyboard open: don't move focus off the text box.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pickChoice(word)}
                >
                  {word}
                </Button>
              ))}
            </PromptInputHeader>
          )}
          <PromptInputTextarea
            placeholder={
              teluguTyping
                ? t.chat.placeholderTranslit
                : t.chat.placeholder
            }
            className={`min-h-14 ${bodySize}`}
            disabled={busy}
            onChange={handleTyping}
            // Phone keyboards would capitalise / "correct" the English letters.
            autoCapitalize={teluguTyping ? "none" : undefined}
            autoCorrect={teluguTyping ? "off" : undefined}
            spellCheck={teluguTyping ? false : undefined}
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
                <span>{t.chat.photo}</span>
              </PromptInputButton>
              <PromptInputButton
                variant={teluguTyping ? "default" : "secondary"}
                size="sm"
                className="h-14 w-20 flex-col gap-1 rounded-xl text-sm"
                aria-pressed={teluguTyping}
                aria-label={t.chat.translitToggle}
                onClick={toggleTeluguTyping}
              >
                <span className="text-xl leading-none font-semibold">
                  {teluguTyping ? "అ" : "A"}
                </span>
                <span>{teluguTyping ? "తెలుగు" : "English"}</span>
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
                  <span>{mic.listening ? t.chat.stop : t.chat.speak}</span>
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
          {t.chat.disclaimer}
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
