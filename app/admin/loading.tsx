import { PageSkeleton } from "@/components/page-skeleton"

// Also covers /admin/ai and /admin/usage (nearest loading boundary).
export default function Loading() {
  return <PageSkeleton cards={3} />
}
