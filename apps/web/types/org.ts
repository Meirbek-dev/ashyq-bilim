/**
 * Organization types - matches the backend OrganizationRead schema.
 *
 * Source: apps/api/src/db/organizations.py (OrganizationBase + OrganizationRead)
 */

// ============================================================================
// Feature flags
// ============================================================================

export interface FeatureFlag {
  enabled: boolean;
  limit: number;
}

export interface AIFeatureFlag extends FeatureFlag {
  model: string;
  streaming_enabled: boolean;
  response_cache_enabled: boolean;
  semantic_cache_enabled: boolean;
  max_tokens_per_request: number;
  max_chat_history: number;
  rate_limit_per_user: number;
}

export interface MembersFeatureFlag extends FeatureFlag {
  admin_limit: number;
}

export interface Features {
  courses: FeatureFlag;
  members: MembersFeatureFlag;
  usergroups: FeatureFlag;
  storage: FeatureFlag;
  ai: AIFeatureFlag;
  assignments: FeatureFlag;
  exams: FeatureFlag;
  payments: { enabled: boolean };
  discussions: FeatureFlag;
  analytics: FeatureFlag;
  collaboration: FeatureFlag;
  api: FeatureFlag;
}

// ============================================================================
// Org config
// ============================================================================

export interface ConfigData {
  config_version: string;
  general: { enabled: boolean; color: string };
  features: Features;
  cloud: { plan: 'free' | 'standard' | 'pro'; custom_domain: boolean };
  landing: Record<string, unknown>;
}

export interface Config {
  config: ConfigData;
  creation_date: string | null;
  update_date: string | null;
}

// ============================================================================
// Platform
// ============================================================================

export interface Platform {
  name: string;
  description: string | null;
  about: string | null;
  email: string;
  socials: Record<string, string> | null;
  links: Record<string, string> | null;
  logo_image: string | null;
  thumbnail_image: string | null;
  previews: Record<string, unknown> | null;
  label: string | null;
  config: Config | null;
  creation_date: string;
  update_date: string;
}
