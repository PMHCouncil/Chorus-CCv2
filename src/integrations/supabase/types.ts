export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      classifications: {
        Row: {
          ai_confidence: number | null
          created_at: string
          divisions: string[]
          feedback_types: string[]
          human_verified: boolean
          id: string
          principle_tags: string[]
          roles_affected: string[]
          sentiment: Database["public"]["Enums"]["sentiment"] | null
          submission_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          divisions?: string[]
          feedback_types?: string[]
          human_verified?: boolean
          id?: string
          principle_tags?: string[]
          roles_affected?: string[]
          sentiment?: Database["public"]["Enums"]["sentiment"] | null
          submission_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          divisions?: string[]
          feedback_types?: string[]
          human_verified?: boolean
          id?: string
          principle_tags?: string[]
          roles_affected?: string[]
          sentiment?: Database["public"]["Enums"]["sentiment"] | null
          submission_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["decision_status"]
          theme_id: string
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          id?: string
          notes?: string | null
          status: Database["public"]["Enums"]["decision_status"]
          theme_id: string
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      exec_redactions: {
        Row: {
          created_at: string
          id: string
          redacted_keyword: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          redacted_keyword: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          redacted_keyword?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      responses: {
        Row: {
          approved_by: string | null
          change_made: boolean
          created_at: string
          draft_text: string
          id: string
          notes: string | null
          reviewer: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["response_status"]
          submission_id: string
        }
        Insert: {
          approved_by?: string | null
          change_made?: boolean
          created_at?: string
          draft_text: string
          id?: string
          notes?: string | null
          reviewer?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["response_status"]
          submission_id: string
        }
        Update: {
          approved_by?: string | null
          change_made?: boolean
          created_at?: string
          draft_text?: string
          id?: string
          notes?: string | null
          reviewer?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["response_status"]
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_themes: {
        Row: {
          confidence: number | null
          submission_id: string
          theme_id: string
        }
        Insert: {
          confidence?: number | null
          submission_id: string
          theme_id: string
        }
        Update: {
          confidence?: number | null
          submission_id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_themes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_themes_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          archived_at: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          raw_data: Json | null
          source: Database["public"]["Enums"]["submission_source"]
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitter_email: string | null
          submitter_name: string | null
          submitter_role: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          raw_data?: Json | null
          source?: Database["public"]["Enums"]["submission_source"]
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitter_email?: string | null
          submitter_name?: string | null
          submitter_role?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          raw_data?: Json | null
          source?: Database["public"]["Enums"]["submission_source"]
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitter_email?: string | null
          submitter_name?: string | null
          submitter_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          submission_count: number
          summary: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          submission_count?: number
          summary?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          submission_count?: number
          summary?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_submissions: {
        Args: { _assignee: string; _ids: string[] }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_content_approver: { Args: { _user_id: string }; Returns: boolean }
      is_content_editor: { Args: { _user_id: string }; Returns: boolean }
      is_content_staff: { Args: { _user_id: string }; Returns: boolean }
      merge_themes: {
        Args: { _source_id: string; _target_id: string }
        Returns: undefined
      }
      refresh_theme_submission_counts: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "hr"
        | "exec"
        | "gm"
        | "gm_ea"
        | "director"
        | "group_manager"
      decision_status:
        | "Acknowledged"
        | "Under consideration"
        | "Change agreed"
        | "No change"
      response_status: "draft" | "hr_reviewed" | "exec_approved" | "sent"
      sentiment: "Supportive" | "Neutral" | "Concerned" | "Opposing"
      submission_source: "form" | "email" | "cc" | "other"
      submission_status: "new" | "classified" | "themed" | "responded" | "sent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "hr",
        "exec",
        "gm",
        "gm_ea",
        "director",
        "group_manager",
      ],
      decision_status: [
        "Acknowledged",
        "Under consideration",
        "Change agreed",
        "No change",
      ],
      response_status: ["draft", "hr_reviewed", "exec_approved", "sent"],
      sentiment: ["Supportive", "Neutral", "Concerned", "Opposing"],
      submission_source: ["form", "email", "cc", "other"],
      submission_status: ["new", "classified", "themed", "responded", "sent"],
    },
  },
} as const
