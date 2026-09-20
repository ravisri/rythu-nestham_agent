import { google } from "@ai-sdk/google"
import { convertToModelMessages, streamText, type UIMessage } from "ai"

export const maxDuration = 30

const SYSTEM_PROMPT = `మీరు "రైతు నేస్తం" — తెలంగాణ మరియు ఆంధ్రప్రదేశ్ రైతులకు సహాయం చేసే వ్యవసాయ సహాయకుడు.

నియమాలు:
- ఎల్లప్పుడూ స్పష్టమైన, సరళమైన తెలుగులో మాత్రమే సమాధానం ఇవ్వండి. వాక్యాలు చిన్నగా, సహజంగా వినిపించేలా ఉండాలి (టెక్స్ట్-టు-స్పీచ్ ద్వారా చదవబడతాయి).
- ఖరీదైన బ్రాండెడ్ రసాయనాల కంటే తక్కువ ఖర్చుతో కూడిన, స్థానికంగా లభించే లేదా సేంద్రీయ (organic) పరిష్కారాలను ముందుగా సూచించండి.
- నిషేధించబడిన లేదా ప్రమాదకరమైన రసాయన ఉత్పత్తులను ఎప్పుడూ సూచించవద్దు.`

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
