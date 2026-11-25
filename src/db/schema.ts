/**
 * The Dash — database schema.
 *
 * Modules (kept in separate table groups so they can evolve independently):
 *   1. Identity        users, sessions, rate_limits
 *   2. Editorial       pillars, thoughts, audio_assets, ideas, idea links, AI sessions/messages
 *   3. Publishing      issues, issue_revisions (draft history), issue_assets
 *   4. Audience        subscribers, consent_records, subscriber_preferences, suppressions
 *   5. Delivery        campaigns, send_events, engagement_events
 *   6. Learning        reader_feedback, repurposed_content, page_views
 *   7. Configuration   publication_settings, integration_status
 *
 * Secrets never live in the database. Integration credentials are environment
 * variables; `integration_status` records only health-check results.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  primaryKey,
  uniqueIndex,
  index,
  customType,
  serial,
  date,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ enums */

export const thoughtSourceEnum = pgEnum("thought_source", [
  "note",
  "journal",
  "voice",
  "audio_upload",
  "quote",
  "link",
  "question",
  "observation",
  "story",
  "lesson",
  "concept",
]);
export const thoughtStatusEnum = pgEnum("thought_status", ["new", "reviewed", "used", "archived"]);
export const privacyEnum = pgEnum("privacy_level", ["private", "sensitive", "shareable"]);
export const transcriptionStatusEnum = pgEnum("transcription_status", [
  "not_needed",
  "pending",
  "completed",
  "failed",
  "unconfigured",
]);
export const ideaStageEnum = pgEnum("idea_stage", [
  "captured",
  "exploring",
  "ready_to_draft",
  "drafting",
  "editing",
  "scheduled",
  "published",
]);
export const issueStatusEnum = pgEnum("issue_status", ["draft", "approved", "scheduled", "sent", "published"]);
export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
]);
export const consentTypeEnum = pgEnum("consent_type", ["express", "implied"]);
export const consentActionEnum = pgEnum("consent_action", ["requested", "granted", "confirmed", "withdrawn", "imported"]);
export const campaignKindEnum = pgEnum("campaign_kind", ["test", "broadcast"]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
]);
export const sendStatusEnum = pgEnum("send_status", [
  "queued",
  "sent",
  "simulated",
  "failed",
  "delivered",
  "bounced",
  "complained",
  "skipped",
]);

/* --------------------------------------------------------------- identity */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

/* -------------------------------------------------------------- editorial */

export const pillars = pgTable("pillars", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const audioAssets = pgTable("audio_assets", {
  id: id(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSeconds: integer("duration_seconds"),
  originalFilename: text("original_filename"),
  /** Either `data` (database storage) or `storageKey` (object storage) is set. */
  data: bytea("data"),
  storageKey: text("storage_key"),
  createdAt: createdAt(),
});

export const thoughts = pgTable(
  "thoughts",
  {
    id: id(),
    sourceType: thoughtSourceEnum("source_type").notNull().default("note"),
    title: text("title"),
    /** Exactly what Col wrote or pasted. Never overwritten by AI. */
    originalContent: text("original_content").notNull().default(""),
    sourceUrl: text("source_url"),
    audioAssetId: uuid("audio_asset_id").references(() => audioAssets.id, { onDelete: "set null" }),
    transcription: text("transcription"),
    transcriptionStatus: transcriptionStatusEnum("transcription_status").notNull().default("not_needed"),
    transcriptionError: text("transcription_error"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: thoughtStatusEnum("status").notNull().default("new"),
    privacy: privacyEnum("privacy").notNull().default("private"),
    /** AI analysis, editable. Stored separately from the original. */
    aiAnalysis: jsonb("ai_analysis").$type<ThoughtAnalysis | null>(),
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    /** Full-text search document (generated by Postgres). */
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') || setweight(array_to_tsvector(tags), 'A') || setweight(to_tsvector('english'::regconfig, coalesce(original_content, '') || ' ' || coalesce(transcription, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("thoughts_created_idx").on(t.createdAt),
    index("thoughts_status_idx").on(t.status),
    index("thoughts_search_idx").using("gin", t.search),
  ],
);

export type ThoughtAnalysis = {
  centralIdea: string;
  underlyingBelief: string;
  potentialContradiction: string;
  personalRelevance: string;
  editorialAngle: string;
  relatedIdeas: string[];
  questionsToExplore: string[];
  suggestedPillars: string[];
  editedByFounder?: boolean;
};

export const thoughtPillars = pgTable(
  "thought_pillars",
  {
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
    pillarId: integer("pillar_id")
      .notNull()
      .references(() => pillars.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.thoughtId, t.pillarId] })],
);

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    conceptNumber: text("concept_number"),
    workingTitle: text("working_title").notNull(),
    thesis: text("thesis").notNull().default(""),
    primaryPillarId: integer("primary_pillar_id").references(() => pillars.id, { onDelete: "set null" }),
    stage: ideaStageEnum("stage").notNull().default("captured"),
    supportingStories: text("supporting_stories").notNull().default(""),
    personalExperiences: text("personal_experiences").notNull().default(""),
    questions: text("questions").notNull().default(""),
    references: text("references").notNull().default(""),
    audienceRelevance: text("audience_relevance").notNull().default(""),
    notes: text("notes").notNull().default(""),
    targetDate: date("target_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    mergedIntoId: uuid("merged_into_id"),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english'::regconfig, coalesce(working_title, '') || ' ' || coalesce(thesis, '')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce(supporting_stories, '') || ' ' || coalesce(personal_experiences, '') || ' ' || coalesce(questions, '') || ' ' || coalesce("references", '') || ' ' || coalesce(audience_relevance, '') || ' ' || coalesce(notes, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ideas_stage_idx").on(t.stage), index("ideas_search_idx").using("gin", t.search)],
);

export const ideaThoughts = pgTable(
  "idea_thoughts",
  {
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.thoughtId] })],
);

export const ideaLinks = pgTable(
  "idea_links",
  {
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    relatedIdeaId: uuid("related_idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.relatedIdeaId] })],
);

/** Editorial-partner stages, in order. */
export const aiStageEnum = pgEnum("ai_stage", ["understand", "interview", "angles", "draft", "critique", "finalize", "done"]);

export const aiSessions = pgTable("ai_sessions", {
  id: id(),
  ideaId: uuid("idea_id")
    .notNull()
    .references(() => ideas.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id"),
  stage: aiStageEnum("stage").notNull().default("understand"),
  selectedAngle: jsonb("selected_angle").$type<Record<string, string> | null>(),
  interviewRounds: integer("interview_rounds").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiMessageRoleEnum = pgEnum("ai_message_role", ["founder", "assistant", "system_note"]);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    /** founder = Col's own words; assistant = AI interpretation. Never conflated. */
    role: aiMessageRoleEnum("role").notNull(),
    kind: text("kind").notNull(), // analysis | questions | answer | angles | draft | critique | final | note
    content: text("content").notNull().default(""),
    data: jsonb("data").$type<unknown>(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_session_idx").on(t.sessionId, t.createdAt)],
);

/* ------------------------------------------------------------- publishing */

export const issues = pgTable(
  "issues",
  {
    id: id(),
    number: integer("number").unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    primaryPillarId: integer("primary_pillar_id").references(() => pillars.id, { onDelete: "set null" }),
    secondaryThemes: text("secondary_themes").array().notNull().default(sql`'{}'::text[]`),
    bodyMd: text("body_md").notNull().default(""),
    recommendationMd: text("recommendation_md").notNull().default(""),
    closingMd: text("closing_md").notNull().default(""),
    subject: text("subject").notNull().default(""),
    previewText: text("preview_text").notNull().default(""),
    status: issueStatusEnum("status").notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Content hash at approval time; editing after approval invalidates it. */
    approvedHash: text("approved_hash"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(subtitle, '')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce(body_md, '') || ' ' || coalesce(recommendation_md, '') || ' ' || coalesce(closing_md, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("issues_published_idx").on(t.publishedAt), index("issues_search_idx").using("gin", t.search)],
);

export const issueRevisions = pgTable(
  "issue_revisions",
  {
    id: id(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // manual | autosave | ai_draft | ai_final | restore
    note: text("note").notNull().default(""),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    recommendationMd: text("recommendation_md").notNull().default(""),
    closingMd: text("closing_md").notNull().default(""),
    subject: text("subject").notNull().default(""),
    previewText: text("preview_text").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("issue_revisions_issue_idx").on(t.issueId, t.createdAt)],
);

export const issueAssets = pgTable("issue_assets", {
  id: id(),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  altText: text("alt_text").notNull().default(""),
  data: bytea("data"),
  storageKey: text("storage_key"),
  createdAt: createdAt(),
});

/* --------------------------------------------------------------- audience */

export const subscribers = pgTable(
  "subscribers",
  {
    id: id(),
    email: text("email").notNull().unique(), // always lower-cased
    name: text("name").notNull().default(""),
    status: subscriberStatusEnum("status").notNull().default("pending"),
    consentSource: text("consent_source").notNull(), // web_form | import | manual
    consentType: consentTypeEnum("consent_type").notNull().default("express"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentEvidence: text("consent_evidence").notNull().default(""),
    /** Expiry for implied consent (CASL: generally 2 years from the relationship). */
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    confirmTokenHash: text("confirm_token_hash"),
    confirmSentAt: timestamp("confirm_sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Stable random token used in manage/unsubscribe links. */
    manageToken: text("manage_token").notNull().unique(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    isTestRecipient: boolean("is_test_recipient").notNull().default(false),
    signupAt: createdAt(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscribers_status_idx").on(t.status)],
);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    action: consentActionEnum("action").notNull(),
    consentType: consentTypeEnum("consent_type").notNull().default("express"),
    source: text("source").notNull(),
    /** What the person saw / agreed to, or the import justification. */
    evidence: text("evidence").notNull().default(""),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("consent_records_subscriber_idx").on(t.subscriberId)],
);

export const subscriberPreferences = pgTable("subscriber_preferences", {
  subscriberId: uuid("subscriber_id")
    .primaryKey()
    .references(() => subscribers.id, { onDelete: "cascade" }),
  newsletter: boolean("newsletter").notNull().default(true),
  occasionalUpdates: boolean("occasional_updates").notNull().default(false),
  updatedAt: updatedAt(),
});

export const suppressions = pgTable("suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(), // unsubscribed | bounced | complained | manual
  detail: text("detail").notNull().default(""),
  createdAt: createdAt(),
});

/* --------------------------------------------------------------- delivery */

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    kind: campaignKindEnum("kind").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    provider: text("provider").notNull(),
    /** Prevents the same broadcast being created twice. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    segmentTags: text("segment_tags").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    previewText: text("preview_text").notNull().default(""),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmationNote: text("confirmation_note").notNull().default(""),
    recipientCount: integer("recipient_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** Short-lived lock so overlapping cron runs can't double-process. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("campaigns_status_idx").on(t.status, t.scheduledFor)],
);

export const sendEvents = pgTable(
  "send_events",
  {
    id: id(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: sendStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("send_events_campaign_email_uq").on(t.campaignId, t.email),
    index("send_events_provider_msg_idx").on(t.providerMessageId),
  ],
);

export const engagementEvents = pgTable(
  "engagement_events",
  {
    id: id(),
    providerEventId: text("provider_event_id").unique(), // webhook dedupe
    sendEventId: uuid("send_event_id").references(() => sendEvents.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    type: text("type").notNull(), // delivered | opened | clicked | bounced | complained | delayed
    url: text("url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw"),
  },
  (t) => [index("engagement_campaign_idx").on(t.campaignId, t.type)],
);

/* --------------------------------------------------------------- learning */

export const readerFeedback = pgTable("reader_feedback", {
  id: id(),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // response | conversation | question | idea | revisit
  fromName: text("from_name").notNull().default(""),
  content: text("content").notNull(),
  followUp: boolean("follow_up").notNull().default(false),
  createdAt: createdAt(),
});

export const repurposedContent = pgTable("repurposed_content", {
  id: id(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  generatedBy: text("generated_by").notNull().default("manual"), // manual | ai
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Privacy-friendly first-party page views: path + day only, no IP, no cookies. */
export const pageViews = pgTable(
  "page_views",
  {
    id: id(),
    path: text("path").notNull(),
    kind: text("kind").notNull().default("view"), // view | subscribe_view | subscribe_submit
    createdAt: createdAt(),
  },
  (t) => [index("page_views_created_idx").on(t.createdAt)],
);

/* ---------------------------------------------------------- configuration */

export const publicationSettings = pgTable("publication_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("The Dash"),
  tagline: text("tagline").notNull().default("A letter about life, becoming, and everything in between."),
  description: text("description").notNull().default(""),
  parentBrand: text("parent_brand").notNull().default("Who Is Col"),
  authorName: text("author_name").notNull().default("Col Atwood"),
  authorBioShort: text("author_bio_short").notNull().default(""),
  aboutMd: text("about_md").notNull().default(""),
  senderName: text("sender_name").notNull().default("Col from The Dash"),
  senderEmail: text("sender_email").notNull().default(""),
  replyToEmail: text("reply_to_email").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  /** CASL requires a valid physical mailing address in every commercial message. */
  mailingAddress: text("mailing_address").notNull().default(""),
  doubleOptIn: boolean("double_opt_in").notNull().default(true),
  signupEnabled: boolean("signup_enabled").notNull().default(true),
  voiceGuidelines: text("voice_guidelines").notNull().default(""),
  privacyPolicyMd: text("privacy_policy_md").notNull().default(""),
  privacyReviewed: boolean("privacy_reviewed").notNull().default(false),
  onboarding: jsonb("onboarding").$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const integrationStatus = pgTable("integration_status", {
  key: text("key").primaryKey(), // email | ai | transcription | cron
  status: text("status").notNull(), // configured | unconfigured | failed | ok
  message: text("message").notNull().default(""),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});
