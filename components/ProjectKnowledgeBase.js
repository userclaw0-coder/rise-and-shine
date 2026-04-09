import { useState, useCallback } from "react";

/**
 * ProjectKnowledgeBase — Knowledge Base editor + KB Prompt copy + Resource Links
 * Used on the individual project page.
 */
export default function ProjectKnowledgeBase({
  knowledgeBase,
  onKnowledgeBaseChange,
  resources,
  onResourcesChange,
  projectName,
  mantra,
  onSave,
  saving,
}) {
  const [kbExpanded, setKbExpanded] = useState(!!knowledgeBase);
  const [resourcesExpanded, setResourcesExpanded] = useState(true);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [newResource, setNewResource] = useState(null);

  const copyKbPrompt = useCallback(() => {
    const prompt = buildKbPrompt(projectName, mantra, knowledgeBase);
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    });
  }, [projectName, mantra, knowledgeBase]);

  const handleAddResource = () => {
    setNewResource({ label: "", url: "", kind: "document", status: "active", notes: "" });
  };

  const handleSaveNewResource = () => {
    if (!newResource?.label?.trim()) return;
    const updated = [...(resources || []), { ...newResource, id: `r_${Date.now()}` }];
    onResourcesChange(updated);
    setNewResource(null);
  };

  const handleRemoveResource = (idx) => {
    const updated = [...(resources || [])];
    updated.splice(idx, 1);
    onResourcesChange(updated);
  };

  const handleUpdateResource = (idx, field, value) => {
    const updated = [...(resources || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    onResourcesChange(updated);
  };

  return (
    <div className="pkb">
      {/* Knowledge Base Section */}
      <div className="pkb__section">
        <button
          type="button"
          className="pkb__section-header"
          onClick={() => setKbExpanded(!kbExpanded)}
        >
          <div className="pkb__section-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              menu_book
            </span>
            <span>Knowledge Base</span>
            {knowledgeBase && (
              <span className="pkb__badge">
                {knowledgeBase.split("\n").filter((l) => l.trim()).length} lines
              </span>
            )}
          </div>
          <span className="material-symbols-outlined">
            {kbExpanded ? "expand_less" : "expand_more"}
          </span>
        </button>

        {kbExpanded && (
          <div className="pkb__section-body">
            <div className="pkb__kb-actions">
              <button
                type="button"
                className="pkb__action-btn"
                onClick={copyKbPrompt}
                title="Copy a prompt to paste into Claude.ai with your project documents to generate a knowledge base"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {copiedPrompt ? "check" : "content_copy"}
                </span>
                {copiedPrompt ? "Copied!" : "Copy KB prompt"}
              </button>
              <button
                type="button"
                className="pkb__action-btn pkb__action-btn--save"
                onClick={onSave}
                disabled={saving}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            <textarea
              className="pkb__kb-textarea"
              value={knowledgeBase || ""}
              onChange={(e) => onKnowledgeBaseChange(e.target.value)}
              placeholder={`Paste extracted knowledge here — contacts, reference numbers, dates, specs, etc.\n\nTip: Click "Copy KB prompt" above, paste it into Claude.ai along with your project documents, and paste the result here.`}
              rows={12}
            />
          </div>
        )}
      </div>

      {/* Resource Links Section */}
      <div className="pkb__section">
        <button
          type="button"
          className="pkb__section-header"
          onClick={() => setResourcesExpanded(!resourcesExpanded)}
        >
          <div className="pkb__section-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              folder_open
            </span>
            <span>Resources</span>
            {resources && resources.length > 0 && (
              <span className="pkb__badge">{resources.length}</span>
            )}
          </div>
          <span className="material-symbols-outlined">
            {resourcesExpanded ? "expand_less" : "expand_more"}
          </span>
        </button>

        {resourcesExpanded && (
          <div className="pkb__section-body">
            {(!resources || resources.length === 0) && !newResource && (
              <p className="pkb__empty">No resources yet. Add links to project folders, documents, or portals.</p>
            )}

            <div className="pkb__resources">
              {(resources || []).map((res, idx) => (
                <div key={res.id || idx} className="pkb__resource">
                  <div className="pkb__resource-main">
                    <span className="material-symbols-outlined pkb__resource-icon">
                      {res.kind === "folder" ? "folder" :
                       res.kind === "contact" ? "person" :
                       res.kind === "credential" ? "key" :
                       "description"}
                    </span>
                    <div className="pkb__resource-info">
                      {res.url ? (
                        <a href={res.url} target="_blank" rel="noopener noreferrer" className="pkb__resource-label">
                          {res.label}
                        </a>
                      ) : (
                        <span className="pkb__resource-label">{res.label}</span>
                      )}
                      {res.notes && <span className="pkb__resource-notes">{res.notes}</span>}
                    </div>
                    {res.status && res.status !== "reference" && (
                      <span className={`pkb__resource-status pkb__resource-status--${res.status}`}>
                        {res.status}
                      </span>
                    )}
                    <button
                      type="button"
                      className="pkb__resource-remove"
                      onClick={() => handleRemoveResource(idx)}
                      aria-label="Remove resource"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  </div>
                </div>
              ))}

              {/* Add new resource form */}
              {newResource && (
                <div className="pkb__resource-form">
                  <input
                    className="pkb__input"
                    placeholder="Label (e.g., Insurance Policy)"
                    value={newResource.label}
                    onChange={(e) => setNewResource({ ...newResource, label: e.target.value })}
                    autoFocus
                  />
                  <input
                    className="pkb__input"
                    placeholder="URL (optional)"
                    value={newResource.url}
                    onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                  />
                  <div className="pkb__resource-form-row">
                    <select
                      className="pkb__select"
                      value={newResource.kind}
                      onChange={(e) => setNewResource({ ...newResource, kind: e.target.value })}
                    >
                      <option value="document">Document</option>
                      <option value="folder">Folder</option>
                      <option value="link">Link</option>
                      <option value="contact">Contact</option>
                      <option value="credential">Credential</option>
                    </select>
                    <select
                      className="pkb__select"
                      value={newResource.status}
                      onChange={(e) => setNewResource({ ...newResource, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                      <option value="reference">Reference</option>
                    </select>
                  </div>
                  <input
                    className="pkb__input"
                    placeholder="Notes (e.g., Approved 2025-11, valid 2 years)"
                    value={newResource.notes}
                    onChange={(e) => setNewResource({ ...newResource, notes: e.target.value })}
                  />
                  <div className="pkb__resource-form-actions">
                    <button type="button" className="pkb__action-btn pkb__action-btn--save" onClick={handleSaveNewResource}>
                      Add
                    </button>
                    <button type="button" className="pkb__action-btn" onClick={() => setNewResource(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!newResource && (
              <button type="button" className="pkb__add-btn" onClick={handleAddResource}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Add resource
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildKbPrompt(projectName, mantra, existingKb) {
  return `You are helping me build a structured knowledge base for my project: "${projectName || "Untitled Project"}"
${mantra ? `Project focus: "${mantra}"` : ""}

I'm attaching documents, photos, emails, or other materials related to this project. Please extract ALL useful information and organize it into a structured knowledge base using this format:

## [CATEGORY NAME]
  Key fact or detail
  Reference numbers, dates, amounts
  Contact: Name, phone, email, role

Categories to look for and extract:
- Registration, permits, licenses (numbers, dates, renewal requirements)
- Insurance & financial (policy numbers, premiums, due dates, coverage)
- Contacts (names, roles, phone, email, relationship to project)
- Specifications & measurements (dimensions, model numbers, part numbers)
- Maintenance & service history (dates, what was done, by whom, cost)
- Pending items (what's been applied for, expected timelines, follow-up needed)
- Account credentials & portals (URLs, account numbers — NOT passwords)
- Quotes & estimates (from whom, amount, what for, expiration)
- Important dates & deadlines (renewals, inspections, payments, expirations)
- Decisions made (what was decided, when, why, alternatives rejected)
- Lessons learned & notes (things to remember, gotchas, tips)

Rules:
- Be exhaustive — extract every useful fact, no matter how small
- Use plain text with indentation, not markdown tables
- Include specific numbers, dates, and names — not summaries
- If a document references other documents or next steps, note those
- Flag any deadlines or expirations within the next 6 months as [UPCOMING]
- Flag any items that appear incomplete or need follow-up as [ACTION NEEDED]

${existingKb ? `[EXISTING KNOWLEDGE BASE — extend this, don't duplicate:]\n${existingKb}` : "[No existing knowledge base — start fresh.]"}`;
}
