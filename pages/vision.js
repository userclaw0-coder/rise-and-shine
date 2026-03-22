import { useEffect, useState, useRef, useMemo } from "react";
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

const MANIFESTATION_TAGS = [
  "High priority manifestation",
  "Strategic anchor",
  "Psychological freedom",
  "Legacy milestone",
  "Freedom marker",
  "Peak signal",
];

function AutoHeightTextarea({ value, onChange, rows = 2, placeholder, style, className, id, ...props }) {
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
      id={id}
      className={className}
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
  const [imageViewerUrl, setImageViewerUrl] = useState(null);
  const [imageViewerZoom, setImageViewerZoom] = useState(1);
  const imageViewerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    function onMatch(e) {
      setIsMobile(e.matches);
    }
    onMatch(mq);
    mq.addEventListener("change", onMatch);
    return () => mq.removeEventListener("change", onMatch);
  }, []);

  useEffect(() => {
    if (!imageViewerUrl) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setImageViewerUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewerUrl]);

  useEffect(() => {
    const el = imageViewerRef.current;
    if (!el || !imageViewerUrl) return;
    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setImageViewerZoom((z) => Math.min(4, Math.max(0.5, z + delta)));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [imageViewerUrl]);

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

  const DOMAIN_ROWS = useMemo(
    () => [
      { key: "business", label: "Business", icon: "lightbulb" },
      { key: "finances", label: "Finances", icon: "payments" },
      { key: "health", label: "Health", icon: "fitness_center" },
      { key: "relationships", label: "Relationships", icon: "favorite" },
      { key: "lifestyle", label: "Lifestyle", icon: "weekend" },
      { key: "growth", label: "Growth", icon: "auto_awesome" },
    ],
    []
  );

  const outcomeLines = useMemo(
    () => desiredOutcomes.split("\n").map((s) => s.trim()).filter(Boolean),
    [desiredOutcomes]
  );

  const thriveLines = useMemo(
    () => goalsToThrive.split("\n").map((s) => s.trim()).filter(Boolean),
    [goalsToThrive]
  );

  const identityParts = useMemo(() => {
    const clauses = identityAttributes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!clauses.length) {
      return { lead: "", beforeGold: "", gold: "", isEmpty: true };
    }
    const last = clauses[clauses.length - 1];
    const beforeClauses = clauses.slice(0, -1);
    const words = last.split(/\s+/).filter(Boolean);
    const goldRaw = words.length ? words[words.length - 1] : "";
    const gold = goldRaw.replace(/[.,;:!?]+$/, "");
    const beforeGold = words.length > 1 ? `${words.slice(0, -1).join(" ")}\u00a0` : "";
    const lead = beforeClauses.length
      ? `${beforeClauses.join(" · ")}${beforeGold || gold ? " · " : ""}`
      : "";
    return { lead, beforeGold, gold, isEmpty: false };
  }, [identityAttributes]);

  const heroBgUrl = fieldImages.identity || photoUrl || visionBoardImageUrl || null;

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

  async function handleRemovePhoto() {
    if (!user) return;
    setError("");
    try {
      setPhotoUrl("");
      const existingRes = await getUserProfile(user.id);
      const existing =
        !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
      const updated = { ...existing, photo_url: null };
      await upsertUserProfile(user.id, updated);
      setSavedMsg("Photo removed.");
      setTimeout(() => setSavedMsg(""), 2500);
    } catch (err) {
      setError(err.message || "Failed to remove photo.");
    }
  }

  async function handleRemoveVisionBoard() {
    if (!user) return;
    setError("");
    try {
      setVisionBoardImageUrl("");
      const existingRes = await getUserProfile(user.id);
      const existing =
        !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
      const updated = { ...existing, vision_board_image_url: null };
      await upsertUserProfile(user.id, updated);
      setSavedMsg("Vision board removed.");
      setTimeout(() => setSavedMsg(""), 2500);
    } catch (err) {
      setError(err.message || "Failed to remove vision board.");
    }
  }

  function handleFieldImageClick(fieldKey) {
    setUploadingFieldKey(fieldKey);
    fieldFileInputRef.current?.click();
  }

  async function handleRemoveFieldImage(fieldKey) {
    if (!user) return;
    setError("");
    setFieldImages((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    try {
      const existingRes = await getUserProfile(user.id);
      const existing =
        !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
      const existingImages = { ...(existing.vision_field_images || {}) };
      delete existingImages[fieldKey];
      const updated = { ...existing, vision_field_images: existingImages };
      await upsertUserProfile(user.id, updated);
      setSavedMsg("Image removed.");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch (err) {
      setError(err.message || "Failed to remove image.");
    }
  }

  function openImageViewer(url) {
    if (!url) return;
    setImageViewerUrl(url);
    setImageViewerZoom(1);
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
      {imageViewerUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          ref={imageViewerRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={(e) => e.target === e.currentTarget && setImageViewerUrl(null)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageViewerUrl}
              alt="Full size"
              style={{
                maxWidth: "90vw",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: 8,
                transform: `scale(${imageViewerZoom})`,
                transformOrigin: "center center",
              }}
              draggable={false}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setImageViewerZoom((z) => Math.max(0.5, z - 0.25))}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                Zoom out
              </button>
              <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 48, textAlign: "center" }}>
                {Math.round(imageViewerZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageViewerZoom((z) => Math.min(4, z + 0.25))}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                Zoom in
              </button>
              <button
                type="button"
                onClick={() => setImageViewerUrl(null)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                  marginLeft: 8,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="rs-vision-page">
        <section
          className="rs-vision-hero"
          style={
            heroBgUrl
              ? { backgroundImage: `linear-gradient(105deg, rgba(26, 26, 26, 0.88) 0%, rgba(26, 26, 26, 0.55) 45%, rgba(74, 61, 0, 0.4) 100%), url(${heroBgUrl})` }
              : undefined
          }
        >
          <div className="rs-vision-hero__grain" aria-hidden />
          <div className="rs-vision-hero__inner">
            <div className="rs-vision-hero__topbar">
              <p className="rs-vision-hero__brand-pill">
                <span className="material-symbols-outlined" aria-hidden>
                  visibility
                </span>
                Strategic vision
              </p>
              <div className="rs-vision-hero__status">
                {autoSaving && <span className="rs-vision-hero__status-dot">Autosaving…</span>}
                {savedMsg && <span className="rs-vision-hero__status-ok">{savedMsg}</span>}
              </div>
            </div>
            <div className={`rs-vision-hero__split${isMobile ? " rs-vision-hero__split--stack" : ""}`}>
              <div className="rs-vision-hero__primary">
                <p className="rs-vision-hero__eyebrow">Identity statement</p>
                <h1 className="rs-vision-hero__mantra">
                  {identityParts.isEmpty ? (
                    <span className="rs-vision-hero__mantra--placeholder">
                      Name who you are becoming — calm, capable, unstoppable. Separate traits with commas; the final word
                      glows gold as your anchor.
                    </span>
                  ) : (
                    <>
                      {identityParts.lead}
                      {identityParts.beforeGold}
                      <span className="rs-vision-hero__gold">{identityParts.gold}</span>
                    </>
                  )}
                </h1>
                <p className="rs-vision-hero__tagline">The mindful curator of a legendary life.</p>
                <div className="rs-vision-hero__identity-tools">
                  <label className="rs-vision-sr-only" htmlFor="vision-identity-input">
                    Identity attributes (comma-separated)
                  </label>
                  <AutoHeightTextarea
                    id="vision-identity-input"
                    value={identityAttributes}
                    onChange={setIdentityAttributes}
                    rows={2}
                    placeholder="e.g. calm, confident, strong entrepreneur"
                    className="rs-vision-hero__identity-input"
                    style={{}}
                  />
                  <div className="rs-vision-hero__identity-visual">
                    {fieldImages.identity ? (
                      <>
                        <button
                          type="button"
                          className="rs-vision-thumb-btn"
                          onClick={() => openImageViewer(fieldImages.identity)}
                        >
                          <img src={fieldImages.identity} alt="" className="rs-vision-thumb-img" />
                        </button>
                        <button
                          type="button"
                          className="rs-vision-mini-btn"
                          onClick={() => handleRemoveFieldImage("identity")}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <div className="rs-vision-thumb-placeholder">Visual anchor</div>
                    )}
                    <button
                      type="button"
                      className="rs-vision-mini-btn rs-vision-mini-btn--gold"
                      onClick={() => handleFieldImageClick("identity")}
                      disabled={uploadingFieldKey !== null}
                    >
                      {uploadingFieldKey === "identity" ? "…" : "Upload"}
                    </button>
                  </div>
                </div>
              </div>

              <aside className="rs-vision-thrive-card rs-vision-thrive-card--hero" aria-label="Goals to thrive">
                <div className="rs-vision-thrive-card__head">
                  <span className="material-symbols-outlined" aria-hidden>
                    verified
                  </span>
                  <div>
                    <h2 className="rs-vision-thrive-card__title">Non-negotiable thrive goals</h2>
                    <p className="rs-vision-thrive-card__sub">Baseline standards your future self insists on.</p>
                  </div>
                </div>
                <ol className="rs-vision-thrive-list">
                  {[0, 1, 2].map((slot) => {
                    const line = thriveLines[slot];
                    return (
                      <li key={slot} className="rs-vision-thrive-list__item">
                        <span className="rs-vision-thrive-list__num">{slot + 1}</span>
                        <p
                          className={
                            line
                              ? "rs-vision-thrive-list__text"
                              : "rs-vision-thrive-list__text rs-vision-thrive-list__text--muted"
                          }
                        >
                          {line || "Define a non-negotiable — movement, depth, recovery…"}
                        </p>
                      </li>
                    );
                  })}
                </ol>
                <label className="rs-vision-sr-only" htmlFor="vision-thrive-area">
                  Edit thrive goals
                </label>
                <AutoHeightTextarea
                  id="vision-thrive-area"
                  value={goalsToThrive}
                  onChange={setGoalsToThrive}
                  rows={3}
                  placeholder={"One goal per line (up to three)\n…"}
                  className="rs-vision-thrive-card__textarea"
                  style={{}}
                />
                <div className="rs-vision-thrive-card__visual rs-vision-thrive-card__visual--hero">
                  {fieldImages.goals_to_thrive ? (
                    <>
                      <button
                        type="button"
                        className="rs-vision-thumb-btn"
                        onClick={() => openImageViewer(fieldImages.goals_to_thrive)}
                      >
                        <img src={fieldImages.goals_to_thrive} alt="" className="rs-vision-side-visual__img" />
                      </button>
                      <button
                        type="button"
                        className="rs-vision-mini-btn rs-vision-mini-btn--light"
                        onClick={() => handleRemoveFieldImage("goals_to_thrive")}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <div className="rs-vision-thumb-placeholder rs-vision-thumb-placeholder--dark">Anchor image</div>
                  )}
                  <button
                    type="button"
                    className="rs-vision-mini-btn rs-vision-mini-btn--light"
                    onClick={() => handleFieldImageClick("goals_to_thrive")}
                    disabled={uploadingFieldKey !== null}
                  >
                    {uploadingFieldKey === "goals_to_thrive" ? "…" : "Upload"}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <details className="rs-vision-studio">
          <summary className="rs-vision-studio__summary">
            <span className="material-symbols-outlined" aria-hidden>
              auto_awesome
            </span>
            Vision studio — photo &amp; AI board
          </summary>
          <div className="rs-vision-studio__body">
            <p className="rs-vision-studio__lead">
              Upload your photo for likeness-aware generation. Your text fuels the board.
            </p>
            <div className={`rs-vision-studio__row${isMobile ? " rs-vision-studio__row--stack" : ""}`}>
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
                  className="rs-btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? "Uploading…" : "Upload photo"}
                </button>
                {photoUrl && (
                  <div className="rs-vision-studio__preview">
                    <button type="button" className="rs-vision-thumb-btn" onClick={() => openImageViewer(photoUrl)}>
                      <img src={photoUrl} alt="You" className="rs-vision-studio__photo" />
                    </button>
                    <button type="button" className="rs-vision-mini-btn" onClick={handleRemovePhoto}>
                      Remove photo
                    </button>
                  </div>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="rs-btn-primary"
                  onClick={handleGenerateVisionBoard}
                  disabled={!photoUrl || generatingBoard}
                >
                  {generatingBoard ? "Generating…" : "Generate vision board"}
                </button>
                {visionBoardImageUrl && (
                  <div className="rs-vision-studio__preview">
                    <button
                      type="button"
                      className="rs-vision-thumb-btn"
                      onClick={() => openImageViewer(visionBoardImageUrl)}
                    >
                      <img src={visionBoardImageUrl} alt="Vision board" className="rs-vision-studio__board" />
                    </button>
                    <button type="button" className="rs-vision-mini-btn" onClick={handleRemoveVisionBoard}>
                      Remove board
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </details>

        <input
          type="file"
          ref={fieldFileInputRef}
          accept="image/*"
          onChange={handleFieldImageChange}
          style={{ display: "none" }}
        />

        <div className="rs-vision-body">
          {error && <p className="rs-vision-error">{error}</p>}

          <section className="rs-vision-section">
            <header className="rs-vision-section__head">
              <h2 className="rs-vision-section__title">Life domains</h2>
              <p className="rs-vision-section__sub">
                Truth statements for each arena — what your subconscious should rehearse daily.
              </p>
            </header>
            <div className={`rs-vision-domain-grid${isMobile ? " rs-vision-domain-grid--1" : ""}`}>
              {DOMAIN_ROWS.map(({ key, label, icon }) => {
                const fieldKey = `life_domain_${key}`;
                const img = fieldImages[fieldKey];
                return (
                  <div key={key} className="rs-vision-domain-card">
                    <div
                      className="rs-vision-domain-card__bg"
                      style={
                        img
                          ? { backgroundImage: `linear-gradient(180deg, rgba(26,26,26,0.2) 0%, rgba(26,26,26,0.92) 100%), url(${img})` }
                          : undefined
                      }
                    />
                    <div className="rs-vision-domain-card__inner">
                      <div className="rs-vision-domain-card__icon" aria-hidden>
                        <span className="material-symbols-outlined">{icon}</span>
                      </div>
                      <span className="rs-vision-domain-card__label">{label}</span>
                      <AutoHeightTextarea
                        value={lifeDomains[key]}
                        onChange={(v) => setLifeDomains((prev) => ({ ...prev, [key]: v }))}
                        rows={2}
                        placeholder="Your truth statement…"
                        className="rs-vision-domain-card__input"
                        style={{}}
                      />
                      <div className="rs-vision-domain-card__tools">
                        {img ? (
                          <>
                            <button
                              type="button"
                              className="rs-vision-domain-card__img-hit"
                              onClick={() => openImageViewer(img)}
                            >
                              Image
                            </button>
                            <button type="button" className="rs-vision-link-btn" onClick={() => handleRemoveFieldImage(fieldKey)}>
                              Remove
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="rs-vision-link-btn"
                          onClick={() => handleFieldImageClick(fieldKey)}
                          disabled={uploadingFieldKey !== null}
                        >
                          {uploadingFieldKey === fieldKey ? "…" : img ? "Replace" : "Add image"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rs-vision-section">
            <header className="rs-vision-section__head">
              <h2 className="rs-vision-section__title">12-month manifestations</h2>
              <p className="rs-vision-section__sub">
                Specific, measurable outcomes on an editorial timeline — not a dry checklist.
              </p>
            </header>
            <div className="rs-vision-outcomes-stack" role="region" aria-label="Desired outcomes">
              {outcomeLines.length === 0 ? (
                <div className="rs-vision-outcomes-empty">
                  <span className="material-symbols-outlined" aria-hidden>
                    timeline
                  </span>
                  <p>Add outcomes below — one per line — and they appear here as manifestation cards.</p>
                </div>
              ) : (
                outcomeLines.map((title, i) => (
                  <article key={`${i}-${title.slice(0, 24)}`} className="rs-vision-outcome-card">
                    <p className="rs-vision-outcome-card__eyebrow">
                      Wave · {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="rs-vision-outcome-card__title">{title}</h3>
                    <span className="rs-vision-outcome-card__pill">{MANIFESTATION_TAGS[i % MANIFESTATION_TAGS.length]}</span>
                  </article>
                ))
              )}
            </div>
            <div className="rs-vision-edit-deck">
              <label className="rs-vision-field-label" htmlFor="vision-outcomes-area">
                Refine your list (one outcome per line)
              </label>
              <div className={`rs-vision-field-row${isMobile ? " rs-vision-field-row--stack" : ""}`}>
                <AutoHeightTextarea
                  id="vision-outcomes-area"
                  value={desiredOutcomes}
                  onChange={setDesiredOutcomes}
                  rows={4}
                  className="rs-vision-textarea"
                  style={{}}
                />
                <div className="rs-vision-side-visual">
                  {fieldImages.desired_outcomes ? (
                    <>
                      <button
                        type="button"
                        className="rs-vision-thumb-btn"
                        onClick={() => openImageViewer(fieldImages.desired_outcomes)}
                      >
                        <img src={fieldImages.desired_outcomes} alt="" className="rs-vision-side-visual__img" />
                      </button>
                      <button type="button" className="rs-vision-mini-btn" onClick={() => handleRemoveFieldImage("desired_outcomes")}>
                        Remove
                      </button>
                    </>
                  ) : (
                    <div className="rs-vision-thumb-placeholder rs-vision-thumb-placeholder--light">Mood board</div>
                  )}
                  <button
                    type="button"
                    className="rs-vision-mini-btn"
                    onClick={() => handleFieldImageClick("desired_outcomes")}
                    disabled={uploadingFieldKey !== null}
                  >
                    {uploadingFieldKey === "desired_outcomes" ? "…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="rs-vision-systems-wrap">
            <div className="rs-vision-systems">
              <figure className="rs-vision-quote">
                <blockquote>
                  You do not rise to the level of your goals. You fall to the level of your systems.
                </blockquote>
                <figcaption>— James Clear</figcaption>
                <div className="rs-vision-quote__pills">
                  <span>Identity-led</span>
                  <span>Systems over goals</span>
                  <span>Strategic clarity</span>
                </div>
              </figure>

              <div className="rs-vision-systems__grid">
                <div className="rs-vision-systems__mini">
                  <span className="material-symbols-outlined" aria-hidden>
                    routine
                  </span>
                  <h3>Morning priming</h3>
                  <p>Re-read this page before you plan the day — let the identity statement land first.</p>
                </div>
                <div className="rs-vision-systems__mini">
                  <span className="material-symbols-outlined" aria-hidden>
                    emoji_events
                  </span>
                  <h3>Success markers</h3>
                  <p>Celebrate evidence, not vibes. Tie wins back to these domains and manifestations.</p>
                </div>
              </div>

              <div className="rs-vision-strategic-block">
                <h3 className="rs-vision-strategic-block__title">Strategic focus</h3>
                <div className={`rs-vision-field-row${isMobile ? " rs-vision-field-row--stack" : ""}`}>
                  <label className="rs-vision-field-stack">
                    <span className="rs-vision-field-label">Leverage areas (one per line)</span>
                    <AutoHeightTextarea value={leverageFocus} onChange={setLeverageFocus} rows={3} className="rs-vision-textarea" style={{}} />
                  </label>
                  <div className="rs-vision-side-visual">
                    {fieldImages.leverage_focus ? (
                      <>
                        <button type="button" className="rs-vision-thumb-btn" onClick={() => openImageViewer(fieldImages.leverage_focus)}>
                          <img src={fieldImages.leverage_focus} alt="" className="rs-vision-side-visual__img" />
                        </button>
                        <button type="button" className="rs-vision-mini-btn" onClick={() => handleRemoveFieldImage("leverage_focus")}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <div className="rs-vision-thumb-placeholder rs-vision-thumb-placeholder--light">Visual</div>
                    )}
                    <button
                      type="button"
                      className="rs-vision-mini-btn"
                      onClick={() => handleFieldImageClick("leverage_focus")}
                      disabled={uploadingFieldKey !== null}
                    >
                      {uploadingFieldKey === "leverage_focus" ? "…" : "Upload"}
                    </button>
                  </div>
                </div>
                <div className={`rs-vision-field-row${isMobile ? " rs-vision-field-row--stack" : ""}`}>
                  <label className="rs-vision-field-stack">
                    <span className="rs-vision-field-label">Quarter focus (comma separated)</span>
                    <input
                      type="text"
                      value={quarterFocus}
                      onChange={(e) => setQuarterFocus(e.target.value)}
                      className="rs-vision-input"
                    />
                  </label>
                  <div className="rs-vision-side-visual">
                    {fieldImages.quarter_focus ? (
                      <>
                        <button type="button" className="rs-vision-thumb-btn" onClick={() => openImageViewer(fieldImages.quarter_focus)}>
                          <img src={fieldImages.quarter_focus} alt="" className="rs-vision-side-visual__img" />
                        </button>
                        <button type="button" className="rs-vision-mini-btn" onClick={() => handleRemoveFieldImage("quarter_focus")}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <div className="rs-vision-thumb-placeholder rs-vision-thumb-placeholder--light">Visual</div>
                    )}
                    <button
                      type="button"
                      className="rs-vision-mini-btn"
                      onClick={() => handleFieldImageClick("quarter_focus")}
                      disabled={uploadingFieldKey !== null}
                    >
                      {uploadingFieldKey === "quarter_focus" ? "…" : "Upload"}
                    </button>
                  </div>
                </div>
                <div className={`rs-vision-field-row${isMobile ? " rs-vision-field-row--stack" : ""}`}>
                  <label className="rs-vision-field-stack">
                    <span className="rs-vision-field-label">Immediate step</span>
                    <AutoHeightTextarea value={immediateStep} onChange={setImmediateStep} rows={2} className="rs-vision-textarea" style={{}} />
                  </label>
                  <div className="rs-vision-side-visual">
                    {fieldImages.immediate_step ? (
                      <>
                        <button type="button" className="rs-vision-thumb-btn" onClick={() => openImageViewer(fieldImages.immediate_step)}>
                          <img src={fieldImages.immediate_step} alt="" className="rs-vision-side-visual__img" />
                        </button>
                        <button type="button" className="rs-vision-mini-btn" onClick={() => handleRemoveFieldImage("immediate_step")}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <div className="rs-vision-thumb-placeholder rs-vision-thumb-placeholder--light">Visual</div>
                    )}
                    <button
                      type="button"
                      className="rs-vision-mini-btn"
                      onClick={() => handleFieldImageClick("immediate_step")}
                      disabled={uploadingFieldKey !== null}
                    >
                      {uploadingFieldKey === "immediate_step" ? "…" : "Upload"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rs-vision-actions">
            <button type="button" className="rs-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save vision"}
            </button>
          </div>

          <details className="rs-vision-archive">
            <summary className="rs-vision-archive__summary">
              <span className="material-symbols-outlined" aria-hidden>
                history
              </span>
              Archives &amp; snapshots
            </summary>
            <div className="rs-vision-archive__body">
              <p className="rs-vision-archive__hint">Save named snapshots and restore prior versions of your operating system.</p>
              <div className="rs-vision-archive__row">
                <input
                  type="text"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="rs-vision-input rs-vision-input--flex"
                />
                <button
                  type="button"
                  className="rs-btn-secondary"
                  onClick={async () => {
                    try {
                      const existingRes = await getUserProfile(user.id);
                      const existing =
                        !existingRes.error && existingRes.data ? existingRes.data.profile || {} : {};
                      const profile = buildProfile(existing);
                      const res = await createUserProfileVersion(user.id, profile, snapshotLabel || null);
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
                      setError(e.message || "Failed to save snapshot.");
                    }
                  }}
                >
                  Save snapshot
                </button>
              </div>
              {versions.length === 0 ? (
                <p className="rs-vision-archive__empty">No snapshots yet.</p>
              ) : (
                <ul className="rs-vision-archive__list">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className="rs-vision-archive__version"
                        onClick={async () => {
                          const res = await getUserProfileVersion(user.id, v.id);
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
                              (p.desired_outcomes || []).map((o) => o.title || "").filter(Boolean).join("\n")
                            );
                            setLeverageFocus((p.leverage_focus || []).join("\n"));
                            setQuarterFocus((p.quarter_focus || []).join(", "));
                            setImmediateStep(p.immediate_step || "");
                            setGoalsToThrive((p.thrive_goals || []).join("\n"));
                            setFieldImages(p.vision_field_images || {});
                            setSavedMsg("Snapshot restored (will autosave).");
                            setTimeout(() => setSavedMsg(""), 2500);
                          }
                        }}
                      >
                        {v.label || "Snapshot"} — {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <footer className="rs-vision-footer">
            <span className="material-symbols-outlined" aria-hidden>
              spa
            </span>
            <span>The Rise &amp; Shine protocol</span>
            <span className="rs-vision-footer__muted">Designed for the mindful curator</span>
          </footer>
        </div>
      </div>
    </DashboardLayout>
    );
  }
