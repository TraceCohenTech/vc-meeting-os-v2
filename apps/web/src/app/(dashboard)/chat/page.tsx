import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from './ChatInterface'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recent conversations
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  // Get memo count for context
  const { count: memoCount } = await supabase
    .from('memos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)

  return (
    <div className="h-full">
      <ChatInterface
        initialConversations={conversations || []}
        memoCount={memoCount || 0}
      />
    </div>
  )
}
