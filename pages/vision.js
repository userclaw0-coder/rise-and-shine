import { useEffect, useState, useRef } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import {
  getUserProfile,
  upsertUserProfile,
  createUserProfileVersion,
  listUserProfileVersions,
  getUserProfileVersion,
} from "../lib/db";
import { supabase } from "../lib/supabaseClient";

function AutoHeightTextarea({ value, onChange, rows = 2, placeholder, style, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 24 * rows)}px`;
  }, [value, rows]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        resize: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        ...style,
      }}
      {...props}
    />
  );
}

export default function VisionPage() {
  const { user, isCheckingAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [versions, setVersions] = useState([]);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [visionBoardImageUrl, setVisionBoardImageUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [generatingBoard, setGeneratingBoard] = useState(false);
  const fileInputRef = useRef(null);

  const [identityAttributes, setIdentityAttributes] = useState("");
  const [lifeDomains, setLifeDomains] = useState({
    business: "",
    finances: "",
    health: "",
    relationships: "",
    lifestyle: "",
    growth: "",
  });
  const [desiredOutcomes, setDesiredOutcomes] = useState("");
  const [leverageFocus, setLeverageFocus] = useState("");
  const [quarterFocus, setQuarterFocus] = useState("");
  const [immediateStep, setImmediateStep] = useState("");
  const [goalsToThrive, setGoalsToThrive] = useState("");
  const [fieldImages, setFieldImages] = useState({});
  const [uploadingFieldKey, setUploadingFieldKey] = useState(null);
  const fieldFileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      setError("");
      const res = await getUserProfile(user.id);
      if (!res.error && res.data && res.data.profile) {
        const p = res.data.profile;
        setIdentityAttributes((p.identity_attributes || []).join(", "));
        setLifeDomains({
          business: p.life_domains?.business || "",
          finances: p.life_domains?.finances || "",
          health: p.life_domains?.health || "",
          relationships: p.life_domains?.relationships || "",
          lifestyle: p.life_domains?.lifestyle || "",
          growth: p.life_domains?.growth || "",
        });
        setDesiredOutcomes(
          (p.desired_outcomes || [])
            .map((o) => o.title || "")
            .filter(Boolean)
            .join("\n")
        );
        setLeverageFocus((p.leverage_focus || []).join("\n"));
        setQuarterFocus((p.quarter_focus || []).join(", "));
        setImmediateStep(p.immediate_step || "");
        setGoalsToThrive((p.thrive_goals || []).join("\n"));
        setPhotoUrl(p.photo_url || "");
        setVisionBoardImageUrl(p.vision_board_image_url || "");
        setFieldImages(p.vision_field_images || {});
      }
      setLoadedOnce(true);
      setLoading(false);
    }
    load();
    async function loadVersions() {
      const vRes = await listUserProfileVersions(user.id, 10);
      if (!vRes.error) {
        setVersions(vRes.data || []);
      }
    }
    loadVersions();
  }, [user]);

  // Autosave vision a short time after edits
  useEffect(() => {
    if (!user || !loadedOnce) return;
    let timeoutId = null;
    setAutoSaving(true);
    timeoutId = setTimeout(async () => {
      try {
        const existingRes = await getUserProfile(user.id);
        const existing =
          !existingRes.error && existingRes.data
            ? existingRes.data.profile || {}
            : {};
        const profile = buildProfile(existing);
        const res = await upsertUserProfile(user.id, profile);
        if (res.error) {
          // Keep it silent to avoid noisy errors; explicit save shows errors.
          console.warn("Autosave vision failed:", res.error);
        } else {
          setSavedMsg("Autosaved.");
          setTimeout(() => setSavedMsg(""), 2000);
        }
      } finally {
        setAutoSaving(false);
      }
    }, 2000);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    identityAttributes,
    lifeDomains,
    desiredOutcomes,
    leverageFocus,
    quarterFocus,
    immediateStep,
    goalsToThrive,
    fieldImages,
    loadedOnce,
  ]);

  if (isCheckingAuth || !user || loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  function buildProfile(existing) {
    const identities = identityAttributes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const outcomes = desiredOutcomes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, idx) => ({
        id: `vision-${idx}`,
        title,
      }));
    return {
      ...(existing || {}),
      user_id: user.id,
      identity_attributes: identities,
      photo_url: photoUrl || (existing && existing.photo_url) || undefined,
      vision_field_images: fieldImages,
      vision_board_image_url:
        visionBoardImageUrl ||
        (existing && existing.vision_board_image_url) ||
        undefined,
      life_domains: lifeDomains,
      desired_outcomes: outcomes,
      leverage_focus: leverageFocus
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      quarter_focus:     quarterFocus
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      immediate_step: immediateStep || "",
      thrive_goals: goalsToThrive
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const existingRes = await getUserProfile(user.id);
      const existing = !existingRes.error && existingRes.data
        ? existingRes.data.profile || {}
        : {};
      const profile = buildProfile(existing);
      const res = await upsertUserProfile(user.id, profile);
      if (res.error) {
        setError(res.error.message || "Failed to save vision.");
      } else {
        setSavedMsg("Vision saved.");
        setTimeout(() => setSavedMsg(""), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target?.files?.[0];
    if (!file || !user) return;
    setError("");
    setUploadingPhoto(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z]/g, "jpg");
      const path = `${user.id}/photo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("user-photos")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setError(uploadError.message || "Upload failed. Ensure the user-photos bucket exists and RLS allows uploads.");
        return;
      }
      const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
      const url = urlData?.publicUrl || "";
      setPhotoUrl(url);
      const existingRes = await getUserProfile(user.id);
      const existing = !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
      await upsertUserProfile(user.id, { ...buildProfile(existing), photo_url: url });
      setSavedMsg("Photo saved.");
      setTimeout(() => setSavedMsg(""), 2500);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFieldImageClick(fieldKey) {
    setUploadingFieldKey(fieldKey);
    fieldFileInputRef.current?.click();
  }

  async function handleFieldImageChange(e) {
    const file = e.target?.files?.[0];
    const fieldKey = uploadingFieldKey;
    if (!file || !user || !fieldKey) {
      setUploadingFieldKey(null);
      return;
    }
    e.target.value = "";
    setError("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z]/g, "jpg");
      const path = `${user.id}/vision/${fieldKey}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("user-photos")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setError(uploadError.message || "Upload failed.");
        return;
      }
      const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
      const url = urlData?.publicUrl || "";
      setFieldImages((prev) => ({ ...prev, [fieldKey]: url }));
      const existingRes = await getUserProfile(user.id);
      const existing = !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
      await upsertUserProfile(user.id, { ...buildProfile(existing), vision_field_images: { ...(existing.vision_field_images || {}), [fieldKey]: url } });
      setSavedMsg("Image saved.");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploadingFieldKey(null);
    }
  }

  async function handleGenerateVisionBoard() {
    if (!user) return;
    setError("");
    setGeneratingBoard(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setError("Please sign in again.");
        return;
      }
      const res = await fetch("/api/vision-board/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Generation failed.");
        return;
      }
      if (data.imageUrl) {
        setVisionBoardImageUrl(data.imageUrl);
        setSavedMsg("Vision board generated.");
        setTimeout(() => setSavedMsg(""), 3000);
      }
    } catch (err) {
      setError(err.message || "Request failed.");
    } finally {
      setGeneratingBoard(false);
    }
  }

  return (
    <DashboardLayout>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          gap: 12,
        }}
      >
          <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Vision
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            Edit your identity, domains, outcomes, and strategic focus. Your Vision board can be edited and modified at any time.
          </p>
        </div>
        <div style={{ fontSize: 12 }}>
          {autoSaving && (
            <span style={{ color: "#6b7280" }}>Autosaving… </span>
          )}
          {savedMsg && (
            <span style={{ color: "#059669" }}>{savedMsg}</span>
          )}
        </div>
      </div>
      <section
        style={{
          marginBottom: 20,
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#fafbfc",
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
          Your photo & Vision Board
        </h2>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          Upload a photo of yourself. We use it with your vision text to generate an AI Vision Board that integrates your likeness.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #0d9488",
                background: "#ccfbf1",
                color: "#0f766e",
                cursor: uploadingPhoto ? "wait" : "pointer",
              }}
            >
              {uploadingPhoto ? "Uploading…" : "Upload photo"}
            </button>
            {photoUrl && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={photoUrl}
                  alt="You"
                  style={{
                    width: 120,
                    height: 120,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={handleGenerateVisionBoard}
              disabled={!photoUrl || generatingBoard}
              style={{
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: photoUrl && !generatingBoard ? "pointer" : "not-allowed",
              }}
            >
              {generatingBoard ? "Generating…" : "Generate Vision Board"}
            </button>
            {visionBoardImageUrl && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={visionBoardImageUrl}
                  alt="Vision Board"
                  style={{
                    maxWidth: 280,
                    maxHeight: 200,
                    objectFit: "contain",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <input
        type="file"
        ref={fieldFileInputRef}
        accept="image/*"
        onChange={handleFieldImageChange}
        style={{ display: "none" }}
      />
      <section
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Identity & vision
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
            Short identity phrases that describe who you are becoming.
          </p>
          <AutoHeightTextarea
            value={identityAttributes}
            onChange={setIdentityAttributes}
            rows={3}
            style={{
              fontSize: 13,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.identity ? (
                <img src={fieldImages.identity} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("identity")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "identity" ? "…" : "Upload"}</button>
            </div>
          </div>
          <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Life domains
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {Object.entries(lifeDomains).map(([key, value]) => {
              const fieldKey = `life_domain_${key}`;
              return (
                <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <label style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ textTransform: "capitalize" }}>{key}</span>
                    <AutoHeightTextarea
                      value={value}
                      onChange={(v) => setLifeDomains((prev) => ({ ...prev, [key]: v }))}
                      rows={2}
                      style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    {fieldImages[fieldKey] ? (
                      <img src={fieldImages[fieldKey]} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#9ca3af" }}>Img</div>
                    )}
                    <button type="button" onClick={() => handleFieldImageClick(fieldKey)} disabled={uploadingFieldKey !== null} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === fieldKey ? "…" : "Upload"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Desired outcomes (12 months)
          </h2>
          <AutoHeightTextarea
            value={desiredOutcomes}
            onChange={setDesiredOutcomes}
            rows={4}
            style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.desired_outcomes ? (
                <img src={fieldImages.desired_outcomes} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("desired_outcomes")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "desired_outcomes" ? "…" : "Upload"}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            3 Goals to Thrive
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
            Up to three goals that help you thrive (one per line). Included in your Vision Board.
          </p>
          <AutoHeightTextarea
            value={goalsToThrive}
            onChange={setGoalsToThrive}
            rows={3}
            placeholder="e.g. Daily movement&#10;Meaningful connections&#10;Learn one new skill"
            style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.goals_to_thrive ? (
                <img src={fieldImages.goals_to_thrive} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("goals_to_thrive")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "goals_to_thrive" ? "…" : "Upload"}</button>
            </div>
          </div>
          <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Strategic focus
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
            <label style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Leverage areas (one per line)
              <AutoHeightTextarea
                value={leverageFocus}
                onChange={setLeverageFocus}
                rows={3}
                style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.leverage_focus ? (
                <img src={fieldImages.leverage_focus} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("leverage_focus")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "leverage_focus" ? "…" : "Upload"}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
            <label style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Quarter focus (comma separated)
              <input
                type="text"
                value={quarterFocus}
                onChange={(e) => setQuarterFocus(e.target.value)}
                style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
              />
            </label>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.quarter_focus ? (
                <img src={fieldImages.quarter_focus} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("quarter_focus")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "quarter_focus" ? "…" : "Upload"}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <label style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Immediate step
              <AutoHeightTextarea
                value={immediateStep}
                onChange={setImmediateStep}
                rows={2}
                style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {fieldImages.immediate_step ? (
                <img src={fieldImages.immediate_step} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>Image</div>
              )}
              <button type="button" onClick={() => handleFieldImageClick("immediate_step")} disabled={uploadingFieldKey !== null} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: uploadingFieldKey ? "wait" : "pointer" }}>{uploadingFieldKey === "immediate_step" ? "…" : "Upload"}</button>
            </div>
          </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#ffffff",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save vision"}
            </button>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            paddingTop: 16,
            marginTop: 8,
            fontSize: 13,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
            History
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
            Save snapshots of your vision and restore older versions.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              type="text"
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{
                flex: 1,
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
              }}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const existingRes = await getUserProfile(user.id);
                  const existing =
                    !existingRes.error && existingRes.data
                      ? existingRes.data.profile || {}
                      : {};
                  const profile = buildProfile(existing);
                  const res = await createUserProfileVersion(
                    user.id,
                    profile,
                    snapshotLabel || null
                  );
                  if (res.error) {
                    setError(res.error.message || "Failed to save snapshot.");
                  } else {
                    setSavedMsg("Snapshot saved.");
                    setSnapshotLabel("");
                    const listRes = await listUserProfileVersions(user.id, 10);
                    if (!listRes.error) {
                      setVersions(listRes.data || []);
                    }
                  }
                } catch (e) {
                  setError(
                    e.message || "Failed to save snapshot."
                  );
                }
              }}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background: "#ffffff",
                color: "#111827",
                cursor: "pointer",
              }}
            >
              Save snapshot
            </button>
          </div>
          {versions.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              No snapshots yet. Save one after updating your vision.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {versions.map((v) => (
                <li key={v.id} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await getUserProfileVersion(user.id, v.id);
                      if (!res.error && res.data && res.data.profile) {
                        const p = res.data.profile;
                        setIdentityAttributes(
                          (p.identity_attributes || []).join(", ")
                        );
                        setLifeDomains({
                          business: p.life_domains?.business || "",
                          finances: p.life_domains?.finances || "",
                          health: p.life_domains?.health || "",
                          relationships: p.life_domains?.relationships || "",
                          lifestyle: p.life_domains?.lifestyle || "",
                          growth: p.life_domains?.growth || "",
                        });
                        setDesiredOutcomes(
                          (p.desired_outcomes || [])
                            .map((o) => o.title || "")
                            .filter(Boolean)
                            .join("\n")
                        );
                        setLeverageFocus(
                          (p.leverage_focus || []).join("\n")
                        );
                        setQuarterFocus(
                          (p.quarter_focus || []).join(", ")
                        );
                        setImmediateStep(p.immediate_step || "");
                        setGoalsToThrive((p.thrive_goals || []).join("\n"));
                        setFieldImages(p.vision_field_images || {});
                        setSavedMsg("Snapshot restored (will autosave).");
                        setTimeout(() => setSavedMsg(""), 2500);
                      }
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      fontSize: 12,
                      padding: "6px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: "#111827",
                      cursor: "pointer",
                    }}
                  >
                    {v.label || "Snapshot"} –{" "}
                    {v.created_at
                      ? new Date(v.created_at).toLocaleString()
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}

