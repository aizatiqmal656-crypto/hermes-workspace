import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { TikTokScreen } from '@/screens/tiktok/tiktok-screen'

export const Route = createFileRoute('/tiktok')({
  ssr: false,
  component: TikTokRoute,
})

function TikTokRoute() {
  usePageTitle('TikTok Pipeline')
  return <TikTokScreen />
}
