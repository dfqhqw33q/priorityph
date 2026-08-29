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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          correlation_id: string | null
          employee_id: string | null
          entity_id: string | null
          entity_type: string | null
          evaluation_id: string | null
          id: string
          ip_address: string | null
          module: string
          new_value: Json | null
          occurred_at: string
          previous_value: Json | null
          reason: string | null
          result: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          correlation_id?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evaluation_id?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_value?: Json | null
          occurred_at?: string
          previous_value?: Json | null
          reason?: string | null
          result?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          correlation_id?: string | null
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evaluation_id?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_value?: Json | null
          occurred_at?: string
          previous_value?: Json | null
          reason?: string | null
          result?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      committee_reviews: {
        Row: {
          action_details: string
          committee_user_id: string
          created_at: string
          evaluation_id: string
          final_action: string
          id: string
          recommendation: string
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          action_details?: string
          committee_user_id: string
          created_at?: string
          evaluation_id: string
          final_action: string
          id?: string
          recommendation?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          action_details?: string
          committee_user_id?: string
          created_at?: string
          evaluation_id?: string
          final_action?: string
          id?: string
          recommendation?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "committee_reviews_committee_user_id_fkey"
            columns: ["committee_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_reviews_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          category: string
          content_type: string
          created_at: string
          created_by: string | null
          employee_id: string
          evaluation_id: string | null
          file_name: string
          file_size: number
          id: string
          storage_path: string
        }
        Insert: {
          category: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          evaluation_id?: string | null
          file_name: string
          file_size?: number
          id?: string
          storage_path: string
        }
        Update: {
          category?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          evaluation_id?: string | null
          file_name?: string
          file_size?: number
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_signatures: {
        Row: {
          content_type: string | null
          created_at: string
          employee_id: string
          evaluation_id: string
          file_size: number | null
          id: string
          method: string
          signature_data: string | null
          signed_at: string
          source_version: number
          storage_path: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          employee_id: string
          evaluation_id: string
          file_size?: number | null
          id?: string
          method: string
          signature_data?: string | null
          signed_at?: string
          source_version?: number
          storage_path?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          employee_id?: string
          evaluation_id?: string
          file_size?: number | null
          id?: string
          method?: string
          signature_data?: string | null
          signed_at?: string
          source_version?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_signatures_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          division: string
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          first_name: string
          full_name: string
          id: string
          job_title: string
          last_name: string
          middle_name: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division?: string
          employee_number: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          first_name?: string
          full_name: string
          id?: string
          job_title?: string
          last_name?: string
          middle_name?: string
          section?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division?: string
          employee_number?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          first_name?: string
          full_name?: string
          id?: string
          job_title?: string
          last_name?: string
          middle_name?: string
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_criteria: {
        Row: {
          created_at: string
          description: string
          id: string
          letter: string
          position: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          letter: string
          position: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          letter?: string
          position?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criteria_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evaluation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_cycles: {
        Row: {
          activated_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          cycle_token: string | null
          ends_at: string
          id: string
          instructions: string
          name: string
          starts_at: string
          status: Database["public"]["Enums"]["cycle_status"]
          template_id: string
          token_generated_at: string | null
          updated_at: string
          year: number
        }
        Insert: {
          activated_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          cycle_token?: string | null
          ends_at: string
          id?: string
          instructions?: string
          name: string
          starts_at: string
          status?: Database["public"]["Enums"]["cycle_status"]
          template_id: string
          token_generated_at?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          activated_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          cycle_token?: string | null
          ends_at?: string
          id?: string
          instructions?: string
          name?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["cycle_status"]
          template_id?: string
          token_generated_at?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_cycles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evaluation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_events: {
        Row: {
          actor_user_id: string | null
          evaluation_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["evaluation_status"] | null
          id: string
          occurred_at: string
          reason: string | null
          to_status: Database["public"]["Enums"]["evaluation_status"] | null
        }
        Insert: {
          actor_user_id?: string | null
          evaluation_id: string
          event_type: string
          from_status?: Database["public"]["Enums"]["evaluation_status"] | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["evaluation_status"] | null
        }
        Update: {
          actor_user_id?: string | null
          evaluation_id?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["evaluation_status"] | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["evaluation_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_events_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_ratings: {
        Row: {
          created_at: string
          criterion_id: string
          evaluation_id: string
          evaluator_type: Database["public"]["Enums"]["evaluator_type"]
          evaluator_user_id: string | null
          id: string
          is_locked: boolean
          rating: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterion_id: string
          evaluation_id: string
          evaluator_type: Database["public"]["Enums"]["evaluator_type"]
          evaluator_user_id?: string | null
          id?: string
          is_locked?: boolean
          rating: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterion_id?: string
          evaluation_id?: string
          evaluator_type?: Database["public"]["Enums"]["evaluator_type"]
          evaluator_user_id?: string | null
          id?: string
          is_locked?: boolean
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_ratings_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_ratings_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_ratings_evaluator_user_id_fkey"
            columns: ["evaluator_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_scores: {
        Row: {
          breakdown: Json
          calculated_at: string | null
          calculated_by: string | null
          calculation_notes: string
          calculation_status: Database["public"]["Enums"]["calculation_status"]
          created_at: string
          employee_average: number | null
          evaluation_id: string
          final_rating_label: string | null
          final_score: number | null
          id: string
          is_locked: boolean
          president_average: number | null
          rule_id: string | null
          rule_version: number | null
          supervisor_average: number | null
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          calculated_at?: string | null
          calculated_by?: string | null
          calculation_notes?: string
          calculation_status?: Database["public"]["Enums"]["calculation_status"]
          created_at?: string
          employee_average?: number | null
          evaluation_id: string
          final_rating_label?: string | null
          final_score?: number | null
          id?: string
          is_locked?: boolean
          president_average?: number | null
          rule_id?: string | null
          rule_version?: number | null
          supervisor_average?: number | null
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          calculated_at?: string | null
          calculated_by?: string | null
          calculation_notes?: string
          calculation_status?: Database["public"]["Enums"]["calculation_status"]
          created_at?: string
          employee_average?: number | null
          evaluation_id?: string
          final_rating_label?: string | null
          final_score?: number | null
          id?: string
          is_locked?: boolean
          president_average?: number | null
          rule_id?: string | null
          rule_version?: number | null
          supervisor_average?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_stage_signatures: {
        Row: {
          evaluation_id: string
          id: string
          method: string
          signature_data: string | null
          signed_at: string
          signer_user_id: string | null
          source_version: number
          stage: string
          storage_path: string | null
        }
        Insert: {
          evaluation_id: string
          id?: string
          method: string
          signature_data?: string | null
          signed_at?: string
          signer_user_id?: string | null
          source_version?: number
          stage: string
          storage_path?: string | null
        }
        Update: {
          evaluation_id?: string
          id?: string
          method?: string
          signature_data?: string | null
          signed_at?: string
          signer_user_id?: string | null
          source_version?: number
          stage?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_stage_signatures_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_stage_signatures_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_templates: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          ai_analysis: Json
          ai_approved: boolean
          ai_generated_at: string | null
          ai_source_version: number | null
          correction_reason: string
          correction_stage: string | null
          created_at: string
          cycle_id: string
          division_snapshot: string
          employee_id: string
          employee_number_snapshot: string
          employee_submitted_at: string | null
          finalization_reason: string
          finalized_at: string | null
          finalized_by: string | null
          full_name_snapshot: string
          id: string
          is_finalized: boolean
          job_title_snapshot: string
          president_step2_submitted_at: string | null
          president_step3_submitted_at: string | null
          president_user_id: string | null
          section_snapshot: string
          status: Database["public"]["Enums"]["evaluation_status"]
          supervisor_remarks: string
          supervisor_step2_advancement: string
          supervisor_step2_career_transfer: string
          supervisor_step2_development: string
          supervisor_step2_recommendations: string
          supervisor_step2_strengths: string
          supervisor_step2_submitted_at: string | null
          supervisor_step2_weaknesses: string
          supervisor_submitted_at: string | null
          supervisor_user_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          ai_analysis?: Json
          ai_approved?: boolean
          ai_generated_at?: string | null
          ai_source_version?: number | null
          correction_reason?: string
          correction_stage?: string | null
          created_at?: string
          cycle_id: string
          division_snapshot: string
          employee_id: string
          employee_number_snapshot: string
          employee_submitted_at?: string | null
          finalization_reason?: string
          finalized_at?: string | null
          finalized_by?: string | null
          full_name_snapshot: string
          id?: string
          is_finalized?: boolean
          job_title_snapshot: string
          president_step2_submitted_at?: string | null
          president_step3_submitted_at?: string | null
          president_user_id?: string | null
          section_snapshot: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          supervisor_remarks?: string
          supervisor_step2_advancement?: string
          supervisor_step2_career_transfer?: string
          supervisor_step2_development?: string
          supervisor_step2_recommendations?: string
          supervisor_step2_strengths?: string
          supervisor_step2_submitted_at?: string | null
          supervisor_step2_weaknesses?: string
          supervisor_submitted_at?: string | null
          supervisor_user_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          ai_analysis?: Json
          ai_approved?: boolean
          ai_generated_at?: string | null
          ai_source_version?: number | null
          correction_reason?: string
          correction_stage?: string | null
          created_at?: string
          cycle_id?: string
          division_snapshot?: string
          employee_id?: string
          employee_number_snapshot?: string
          employee_submitted_at?: string | null
          finalization_reason?: string
          finalized_at?: string | null
          finalized_by?: string | null
          full_name_snapshot?: string
          id?: string
          is_finalized?: boolean
          job_title_snapshot?: string
          president_step2_submitted_at?: string | null
          president_step3_submitted_at?: string | null
          president_user_id?: string | null
          section_snapshot?: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          supervisor_remarks?: string
          supervisor_step2_advancement?: string
          supervisor_step2_career_transfer?: string
          supervisor_step2_development?: string
          supervisor_step2_recommendations?: string
          supervisor_step2_strengths?: string
          supervisor_step2_submitted_at?: string | null
          supervisor_step2_weaknesses?: string
          supervisor_submitted_at?: string | null
          supervisor_user_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_president_user_id_fkey"
            columns: ["president_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_supervisor_user_id_fkey"
            columns: ["supervisor_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_locked: boolean
          job_title: string | null
          last_login_at: string | null
          must_change_password: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_locked?: boolean
          job_title?: string | null
          last_login_at?: string | null
          must_change_password?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          job_title?: string | null
          last_login_at?: string | null
          must_change_password?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      login_events: {
        Row: {
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          occurred_at: string
          result: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          result?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          result?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          audience_permission: string
          body: string
          cycle_id: string | null
          dedupe_key: string | null
          evaluation_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          title: string
        }
        Insert: {
          audience_permission: string
          body?: string
          cycle_id?: string | null
          dedupe_key?: string | null
          evaluation_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          title: string
        }
        Update: {
          audience_permission?: string
          body?: string
          cycle_id?: string | null
          dedupe_key?: string | null
          evaluation_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_events: {
        Row: {
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          occurred_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          module?: string
        }
        Relationships: []
      }
      personnel_processing: {
        Row: {
          adjective_rating: string
          created_at: string
          evaluation_id: string
          id: string
          last_increase_amount: number | null
          last_increase_date: string | null
          last_increase_nature: string
          personnel_user_id: string
          present_salary: number | null
          recommended_increase_bonus: string
          status: string
          submitted_at: string | null
          total_points: number | null
          updated_at: string
          version: number
        }
        Insert: {
          adjective_rating?: string
          created_at?: string
          evaluation_id: string
          id?: string
          last_increase_amount?: number | null
          last_increase_date?: string | null
          last_increase_nature?: string
          personnel_user_id: string
          present_salary?: number | null
          recommended_increase_bonus?: string
          status?: string
          submitted_at?: string | null
          total_points?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          adjective_rating?: string
          created_at?: string
          evaluation_id?: string
          id?: string
          last_increase_amount?: number | null
          last_increase_date?: string | null
          last_increase_nature?: string
          personnel_user_id?: string
          present_salary?: number | null
          recommended_increase_bonus?: string
          status?: string
          submitted_at?: string | null
          total_points?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "personnel_processing_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_processing_personnel_user_id_fkey"
            columns: ["personnel_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      president_responses: {
        Row: {
          created_at: string
          evaluation_id: string
          id: string
          is_locked: boolean
          item_id: string
          responded_by: string | null
          step: number
          updated_at: string
          value_text: string
        }
        Insert: {
          created_at?: string
          evaluation_id: string
          id?: string
          is_locked?: boolean
          item_id: string
          responded_by?: string | null
          step: number
          updated_at?: string
          value_text?: string
        }
        Update: {
          created_at?: string
          evaluation_id?: string
          id?: string
          is_locked?: boolean
          item_id?: string
          responded_by?: string | null
          step?: number
          updated_at?: string
          value_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "president_responses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "president_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "president_step_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "president_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      president_step_items: {
        Row: {
          code: string
          created_at: string
          help_text: string
          id: string
          input_type: string
          is_required: boolean
          label: string
          options: Json
          position: number
          template_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          help_text?: string
          id?: string
          input_type?: string
          is_required?: boolean
          label: string
          options?: Json
          position: number
          template_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          help_text?: string
          id?: string
          input_type?: string
          is_required?: boolean
          label?: string
          options?: Json
          position?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "president_step_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "president_step_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      president_step_templates: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          step: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          step: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          step?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_submission_attempts: {
        Row: {
          attempt_type: string
          cycle_id: string | null
          device_session_id: string | null
          employee_id: string | null
          id: string
          ip_address: string | null
          occurred_at: string
          outcome: string
          submission_id: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_type: string
          cycle_id?: string | null
          device_session_id?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          occurred_at?: string
          outcome: string
          submission_id?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_type?: string
          cycle_id?: string | null
          device_session_id?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          occurred_at?: string
          outcome?: string
          submission_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_submission_attempts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_submission_attempts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewing_supervisor_reviews: {
        Row: {
          comments: string
          created_at: string
          evaluation_id: string
          id: string
          recommendations: string
          reviewer_user_id: string
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          comments?: string
          created_at?: string
          evaluation_id: string
          id?: string
          recommendations?: string
          reviewer_user_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          comments?: string
          created_at?: string
          evaluation_id?: string
          id?: string
          recommendations?: string
          reviewer_user_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviewing_supervisor_reviews_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewing_supervisor_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_code: string
          role_code: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          permission_code: string
          role_code: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          permission_code?: string
          role_code?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: Database["public"]["Enums"]["app_role"]
          created_at: string
          description: string
          name: string
        }
        Insert: {
          code: Database["public"]["Enums"]["app_role"]
          created_at?: string
          description?: string
          name: string
        }
        Update: {
          code?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          description?: string
          name?: string
        }
        Relationships: []
      }
      scoring_rule_bands: {
        Row: {
          created_at: string
          id: string
          label: string
          max_score: number
          min_score: number
          position: number
          rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          max_score: number
          min_score: number
          position?: number
          rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          max_score?: number
          min_score?: number
          position?: number
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rule_bands_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rule_factor_weights: {
        Row: {
          created_at: string
          criterion_id: string
          id: string
          rule_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          criterion_id: string
          id?: string
          rule_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          id?: string
          rule_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rule_factor_weights_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rule_factor_weights_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          created_by: string | null
          employee_weight: number
          factor_weighting: Database["public"]["Enums"]["weighting_mode"]
          id: string
          name: string
          notes: string
          required_factor_weight_total: number
          rounding_decimals: number
          show_employee_average: boolean
          show_president_result: boolean
          show_supervisor_average: boolean
          status: Database["public"]["Enums"]["scoring_rule_status"]
          supervisor_weight: number
          template_id: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_weight?: number
          factor_weighting?: Database["public"]["Enums"]["weighting_mode"]
          id?: string
          name: string
          notes?: string
          required_factor_weight_total?: number
          rounding_decimals?: number
          show_employee_average?: boolean
          show_president_result?: boolean
          show_supervisor_average?: boolean
          status?: Database["public"]["Enums"]["scoring_rule_status"]
          supervisor_weight?: number
          template_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_weight?: number
          factor_weighting?: Database["public"]["Enums"]["weighting_mode"]
          id?: string
          name?: string
          notes?: string
          required_factor_weight_total?: number
          rounding_decimals?: number
          show_employee_average?: boolean
          show_president_result?: boolean
          show_supervisor_average?: boolean
          status?: Database["public"]["Enums"]["scoring_rule_status"]
          supervisor_weight?: number
          template_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evaluation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_active_administrators: { Args: never; Returns: number }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_usable: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "ADMINISTRATOR"
        | "PRESIDENT"
        | "HR"
        | "SUPERVISOR"
        | "REVIEWING_SUPERVISOR"
        | "COMMITTEE"
      calculation_status: "PENDING" | "CALCULATED" | "INVALID"
      cycle_status: "DRAFT" | "ACTIVE" | "CLOSED" | "DISABLED"
      employment_status: "ACTIVE" | "INACTIVE"
      evaluation_status:
        | "EMPLOYEE_SUBMITTED"
        | "SUPERVISOR_DRAFT"
        | "SUPERVISOR_SUBMITTED"
        | "REVIEWING_SUPERVISOR_REVIEW"
        | "PERSONNEL_PROCESSING"
        | "COMMITTEE_REVIEW"
        | "PRESIDENT_APPROVAL"
        | "RETURNED_FOR_CORRECTION"
        | "FINALIZED"
      evaluator_type: "EMPLOYEE" | "SUPERVISOR" | "REVIEWING_SUPERVISOR" | "PRESIDENT"
      scoring_rule_status: "DRAFT" | "ACTIVE" | "RETIRED"
      weighting_mode: "EQUAL" | "WEIGHTED"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "ADMINISTRATOR",
        "PRESIDENT",
        "HR",
        "SUPERVISOR",
        "REVIEWING_SUPERVISOR",
        "COMMITTEE",
      ],
      calculation_status: ["PENDING", "CALCULATED", "INVALID"],
      cycle_status: ["DRAFT", "ACTIVE", "CLOSED", "DISABLED"],
      employment_status: ["ACTIVE", "INACTIVE"],
      evaluation_status: [
        "EMPLOYEE_SUBMITTED",
        "SUPERVISOR_DRAFT",
        "SUPERVISOR_SUBMITTED",
        "REVIEWING_SUPERVISOR_REVIEW",
        "PERSONNEL_PROCESSING",
        "COMMITTEE_REVIEW",
        "PRESIDENT_APPROVAL",
        "RETURNED_FOR_CORRECTION",
        "FINALIZED",
      ],
      evaluator_type: ["EMPLOYEE", "SUPERVISOR", "REVIEWING_SUPERVISOR", "PRESIDENT"],
      scoring_rule_status: ["DRAFT", "ACTIVE", "RETIRED"],
      weighting_mode: ["EQUAL", "WEIGHTED"],
    },
  },
} as const
