export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          email: string | null
          settings: Json
          notification_email: string | null
          digest_frequency: 'never' | 'daily' | 'weekly' | 'monthly'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          settings?: Json
          notification_email?: string | null
          digest_frequency?: 'never' | 'daily' | 'weekly' | 'monthly'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          settings?: Json
          notification_email?: string | null
          digest_frequency?: 'never' | 'daily' | 'weekly' | 'monthly'
          created_at?: string
          updated_at?: string
        }
      }
      integrations: {
        Row: {
          id: string
          user_id: string
          provider: string
          credentials: Json
          status: 'active' | 'inactive' | 'error'
          last_sync_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          credentials?: Json
          status?: 'active' | 'inactive' | 'error'
          last_sync_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          credentials?: Json
          status?: 'active' | 'inactive' | 'error'
          last_sync_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      folders: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string | null
          icon: string | null
          template: Json
          is_default: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string | null
          icon?: string | null
          template?: Json
          is_default?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string | null
          icon?: string | null
          template?: Json
          is_default?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      companies: {
        Row: {
          id: string
          user_id: string
          name: string
          website: string | null
          domain: string | null
          normalized_domain: string | null
          stage: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'growth' | 'public' | null
          status: 'tracking' | 'actively-reviewing' | 'due-diligence' | 'passed' | 'invested' | 'exited'
          industry: string | null
          founders: Json
          notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          website?: string | null
          domain?: string | null
          normalized_domain?: string | null
          stage?: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'growth' | 'public' | null
          status?: 'tracking' | 'actively-reviewing' | 'due-diligence' | 'passed' | 'invested' | 'exited'
          industry?: string | null
          founders?: Json
          notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          website?: string | null
          domain?: string | null
          normalized_domain?: string | null
          stage?: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'growth' | 'public' | null
          status?: 'tracking' | 'actively-reviewing' | 'due-diligence' | 'passed' | 'invested' | 'exited'
          industry?: string | null
          founders?: Json
          notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      memos: {
        Row: {
          id: string
          user_id: string
          folder_id: string | null
          company_id: string | null
          source: string
          source_id: string | null
          title: string
          content: string
          summary: string | null
          meeting_date: string | null
          duration_minutes: number | null
          participants: string[] | null
          tags: string[]
          drive_file_id: string | null
          drive_url: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          folder_id?: string | null
          company_id?: string | null
          source?: string
          source_id?: string | null
          title: string
          content: string
          summary?: string | null
          meeting_date?: string | null
          duration_minutes?: number | null
          participants?: string[] | null
          tags?: string[]
          drive_file_id?: string | null
          drive_url?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          folder_id?: string | null
          company_id?: string | null
          source?: string
          source_id?: string | null
          title?: string
          content?: string
          summary?: string | null
          meeting_date?: string | null
          duration_minutes?: number | null
          participants?: string[] | null
          tags?: string[]
          drive_file_id?: string | null
          drive_url?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          memo_id: string | null
          company_id: string | null
          title: string
          description: string | null
          due_date: string | null
          priority: 'low' | 'medium' | 'high'
          status: 'pending' | 'in_progress' | 'completed'
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          memo_id?: string | null
          company_id?: string | null
          title: string
          description?: string | null
          due_date?: string | null
          priority?: 'low' | 'medium' | 'high'
          status?: 'pending' | 'in_progress' | 'completed'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          memo_id?: string | null
          company_id?: string | null
          title?: string
          description?: string | null
          due_date?: string | null
          priority?: 'low' | 'medium' | 'high'
          status?: 'pending' | 'in_progress' | 'completed'
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          sources: Json
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          sources?: Json
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          sources?: Json
          metadata?: Json
          created_at?: string
        }
      }
      processing_jobs: {
        Row: {
          id: string
          user_id: string
          source: string
          source_id: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed'
          current_step: string | null
          progress: number
          result: Json
          error: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source: string
          source_id?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          current_step?: string | null
          progress?: number
          result?: Json
          error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          source?: string
          source_id?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          current_step?: string | null
          progress?: number
          result?: Json
          error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      memo_revisions: {
        Row: {
          id: string
          memo_id: string
          user_id: string
          title: string
          content: string
          summary: string | null
          meeting_date: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          memo_id: string
          user_id: string
          title: string
          content: string
          summary?: string | null
          meeting_date?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          memo_id?: string
          user_id?: string
          title?: string
          content?: string
          summary?: string | null
          meeting_date?: string | null
          metadata?: Json
          created_at?: string
        }
      }
    }
    Functions: {
      search_memos: {
        Args: {
          search_query: string
          p_user_id: string
          result_limit?: number
        }
        Returns: {
          id: string
          title: string
          summary: string | null
          content: string
          meeting_date: string | null
          company_id: string | null
          folder_id: string | null
          rank: number
        }[]
      }
      get_attention_tasks: {
        Args: {
          p_user_id: string
          hours_ahead?: number
        }
        Returns: {
          id: string
          title: string
          description: string | null
          due_date: string | null
          priority: string
          status: string
          memo_id: string | null
          company_id: string | null
          is_overdue: boolean
        }[]
      }
      get_user_stats: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
    }
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Integration = Database['public']['Tables']['integrations']['Row']
export type Folder = Database['public']['Tables']['folders']['Row']
export type Company = Database['public']['Tables']['companies']['Row']
export type Memo = Database['public']['Tables']['memos']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type ProcessingJob = Database['public']['Tables']['processing_jobs']['Row']
export type MemoRevision = Database['public']['Tables']['memo_revisions']['Row']

// Insert types
export type NewCompany = Database['public']['Tables']['companies']['Insert']
export type NewMemo = Database['public']['Tables']['memos']['Insert']
export type NewTask = Database['public']['Tables']['tasks']['Insert']
export type NewConversation = Database['public']['Tables']['conversations']['Insert']
export type NewMessage = Database['public']['Tables']['messages']['Insert']
export type NewProcessingJob = Database['public']['Tables']['processing_jobs']['Insert']
export type NewMemoRevision = Database['public']['Tables']['memo_revisions']['Insert']
export type NewFolder = Database['public']['Tables']['folders']['Insert']

// Update types
export type UpdateCompany = Database['public']['Tables']['companies']['Update']
export type UpdateMemo = Database['public']['Tables']['memos']['Update']
export type UpdateTask = Database['public']['Tables']['tasks']['Update']
export type UpdateProcessingJob = Database['public']['Tables']['processing_jobs']['Update']
export type UpdateFolder = Database['public']['Tables']['folders']['Update']
