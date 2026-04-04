import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { getHumanNeedStrategyLabel } from "../../../lib/humanNeedStrategies";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Build a single vision text string from profile for AI image prompt.
 */
function buildVisionPrompt(profile) {
  const parts = [];
  if (profile.identity_attributes?.length) {
    parts.push("Identity: " + profile.identity_attributes.join(", "));
  }
  if (profile.desired_outcomes?.length) {
    parts.push(
      "Desired outcomes: " +
        profile.desired_outcomes.map((o) => o.title).filter(Boolean).join("; ")
    );
  }
  if (profile.life_domains && typeof profile.life_domains === "object") {
    const domains = Object.entries(profile.life_domains)
      .filter(([, v]) => v)
      .map(([k, v]) => `${getHumanNeedStrategyLabel(k)}: ${v}`);
    if (domains.length) parts.push("Human need strategies: " + domains.join(". "));
  }
  if (profile.leverage_focus?.length) {
    parts.push("Leverage focus: " + profile.leverage_focus.join(", "));
  }
  if (profile.quarter_focus?.length) {
    parts.push("Quarter focus: " + profile.quarter_focus.join(", "));
  }
  if (profile.immediate_step) {
    parts.push("Immediate step: " + profile.immediate_step);
  }
  if (profile.thrive_goals?.length) {
    parts.push("Goals to thrive: " + profile.thrive_goals.join(". "));
  }
  const text = parts.join("\n");
  return (
    "Inspirational vision board image, aspirational and motivating, incorporating this person's likeness. " +
    "Theme and mood from their vision: " +
    (text || "personal growth and clarity")
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (e) {
    return res.status(e.status === 401 ? 401 : 500).json({
      error: e.message || "Authentication required",
    });
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("user_profile")
    .select("profile")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profileRow?.profile) {
    return res.status(500).json({
      error: "Could not load profile.",
    });
  }

  const profile = profileRow.profile;
  const photoUrl = profile.photo_url;

  if (!photoUrl) {
    return res.status(400).json({
      error: "Upload a photo of yourself on the Vision page first, then generate your Vision Board.",
    });
  }

  const visionPrompt = buildVisionPrompt(profile);

  // AI image generation: set REPLICATE_API_TOKEN and VISION_BOARD_REPLICATE_VERSION
  // (e.g. a Replicate model that accepts image + prompt for identity-preserving generation).
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelVersion = process.env.VISION_BOARD_REPLICATE_VERSION;

  if (apiToken && modelVersion) {
    try {
      const response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: modelVersion,
          input: {
            image: photoUrl,
            prompt: visionPrompt,
          },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(502).json({
          error: "Vision board generation failed. Try again or check server logs.",
          details: errText.slice(0, 200),
        });
      }
      const pred = await response.json();
      const id = pred.id;
      if (!id) {
        return res.status(502).json({ error: "Invalid response from image service." });
      }
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
          headers: { Authorization: `Token ${apiToken}` },
        });
        const statusData = await statusRes.json();
        if (statusData.status === "succeeded" && statusData.output) {
          const output = statusData.output;
          const imageUrl = Array.isArray(output) ? output[0] : output;
          if (imageUrl) {
            await supabase
              .from("user_profile")
              .update({
                profile: { ...profile, vision_board_image_url: imageUrl },
              })
              .eq("user_id", userId);
            return res.status(200).json({ imageUrl });
          }
        }
        if (statusData.status === "failed" || statusData.status === "canceled") {
          return res.status(502).json({
            error: statusData.error || "Generation failed.",
          });
        }
      }
      return res.status(504).json({ error: "Generation timed out." });
    } catch (err) {
      console.error("Vision board generate error:", err);
      return res.status(500).json({
        error: err.message || "Vision board generation failed.",
      });
    }
  }

  return res.status(503).json({
    error:
      "Vision board AI is not configured. Set REPLICATE_API_TOKEN and VISION_BOARD_REPLICATE_VERSION (Replicate model that accepts image + prompt) in your environment.",
    needsConfig: true,
  });
}
