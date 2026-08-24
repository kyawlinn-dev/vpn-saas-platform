import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  NOTIFICATION_EVENT_TYPES,
  EVENT_META,
  DEFAULT_TEMPLATES,
  renderNotification,
  formatBurmeseDate,
} from "../../bot/notificationTemplates.js";

const router = express.Router();

// Sample data used for previews — matches the shape notificationService.js
// builds for each event type, but with obviously-fake values so a reseller
// can see the format without it looking like a real customer record.
const SAMPLE_DATA = {
  brand_name: "{brand_name}", // filled in per-request from the reseller's own brand
  plan_name: "Premium 30 Days",
  expiry_date: formatBurmeseDate("2026-09-15"),
  deep_link_url: "https://app.novanetmm.com/?slug=your-shop",
  support_username: "your_support",
  reject_reason: "လွှဲပြောင်းငွေပမာဏ မကိုက်ညီပါ",
};

// Only allow a small safe subset of HTML in reseller-authored text — matches
// what Telegram's parse_mode=HTML supports and what our default templates
// use. Anything else risks a broken/rejected sendMessage call.
const ALLOWED_TAG_PATTERN = /<\/?(b|i|u|s|code|a)(\s+href="[^"]*")?\s*>/gi;

function findDisallowedTags(text) {
  const stripped = text.replace(ALLOWED_TAG_PATTERN, "");
  const match = stripped.match(/<\/?[a-zA-Z][^>]*>/);
  return match ? match[0] : null;
}

function findUnknownPlaceholders(text, eventType) {
  const known = new Set(EVENT_META[eventType]?.placeholders || []);
  const found = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(found)].filter((key) => !known.has(key));
}

// GET /api/reseller/notification-templates
// Returns all 6 event types with their effective text (custom or default)
// and metadata for the editor UI.
router.get("/", async (req, res) => {
  const resellerId = req.reseller.id;

  const { data: customRows, error } = await supabase
    .from("reseller_notification_templates")
    .select("event_type, custom_text, updated_at")
    .eq("reseller_id", resellerId);

  if (error) {
    console.error("notification-templates GET error:", error);
    return res.status(500).json({ error: "Failed to load notification templates" });
  }

  const customByType = new Map((customRows || []).map((r) => [r.event_type, r]));

  const templates = NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const custom = customByType.get(eventType);
    return {
      event_type: eventType,
      label: EVENT_META[eventType].label,
      description: EVENT_META[eventType].description,
      placeholders: EVENT_META[eventType].placeholders,
      is_custom: Boolean(custom),
      text: custom?.custom_text || DEFAULT_TEMPLATES[eventType],
      default_text: DEFAULT_TEMPLATES[eventType],
      updated_at: custom?.updated_at || null,
    };
  });

  return res.json({ templates });
});

// PATCH /api/reseller/notification-templates/:eventType
// Body: { text: string }
router.patch("/:eventType", async (req, res) => {
  const resellerId = req.reseller.id;
  const { eventType } = req.params;
  const { text } = req.body || {};

  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: "Unknown event_type" });
  }
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: "text is too long (max 2000 characters)" });
  }

  const badTag = findDisallowedTags(text);
  if (badTag) {
    return res.status(400).json({
      error: `Only <b>, <i>, <u>, <s>, <code>, and <a href="..."> tags are allowed. Found: ${badTag}`,
    });
  }

  const unknownPlaceholders = findUnknownPlaceholders(text, eventType);
  if (unknownPlaceholders.length > 0) {
    return res.status(400).json({
      error: `Unknown placeholder(s): ${unknownPlaceholders.map((p) => `{${p}}`).join(", ")}. Allowed: ${EVENT_META[eventType].placeholders.map((p) => `{${p}}`).join(", ")}`,
    });
  }

  const { error } = await supabase
    .from("reseller_notification_templates")
    .upsert(
      {
        reseller_id: resellerId,
        event_type: eventType,
        custom_text: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reseller_id,event_type" }
    );

  if (error) {
    console.error("notification-templates PATCH error:", error);
    return res.status(500).json({ error: "Failed to save template" });
  }

  return res.json({ ok: true, event_type: eventType, text, is_custom: true });
});

// DELETE /api/reseller/notification-templates/:eventType
// Reverts to platform default by removing the override row.
router.delete("/:eventType", async (req, res) => {
  const resellerId = req.reseller.id;
  const { eventType } = req.params;

  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: "Unknown event_type" });
  }

  const { error } = await supabase
    .from("reseller_notification_templates")
    .delete()
    .eq("reseller_id", resellerId)
    .eq("event_type", eventType);

  if (error) {
    console.error("notification-templates DELETE error:", error);
    return res.status(500).json({ error: "Failed to reset template" });
  }

  return res.json({ ok: true, event_type: eventType, text: DEFAULT_TEMPLATES[eventType], is_custom: false });
});

// POST /api/reseller/notification-templates/:eventType/preview
// Body: { text: string } — renders with sample data, no DB write, no send.
router.post("/:eventType/preview", async (req, res) => {
  const { eventType } = req.params;
  const { text } = req.body || {};

  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: "Unknown event_type" });
  }
  if (typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

  // Pull the reseller's real brand name for a more useful preview.
  const { data: miniapp } = await supabase
    .from("reseller_miniapps")
    .select("brand_name")
    .eq("reseller_id", req.reseller.id)
    .maybeSingle();

  const sample = { ...SAMPLE_DATA, brand_name: miniapp?.brand_name || "Your Brand" };
  const rendered = renderNotification(eventType, sample, text || null);

  return res.json({ preview: rendered });
});

export default router;
