/* VendorIQ Command Center — 9. Data model.
   A draft proposal derived from the requirements below, not a live schema. Nothing here has been
   created in backend/src/models — that is a separate, later decision per the build brief. */

const DATA_MODEL_ENTITIES = [
  {
    name: "JobSeeker",
    fields: ["id : uuid", "email : string", "created_at : datetime"],
    reqs: ["REQ-002", "REQ-004"],
  },
  {
    name: "Recruiter",
    fields: ["id : uuid", "display_name : string", "company : string"],
    reqs: ["REQ-007"],
  },
  {
    name: "IngestionBatch",
    fields: ["id : uuid", "job_seeker_id : uuid → JobSeeker", "source_file_name : string", "uploaded_at : datetime", "clean_status : enum(pending, clean, rejected)"],
    reqs: ["REQ-001", "REQ-014"],
  },
  {
    name: "InteractionRecord",
    fields: [
      "id : uuid",
      "batch_id : uuid → IngestionBatch",
      "job_seeker_id : uuid → JobSeeker",
      "recruiter_id : uuid → Recruiter",
      "occurred_at : datetime",
      "channel : string",
      "had_reply : boolean",
    ],
    reqs: ["REQ-002", "REQ-007", "REQ-011", "REQ-012", "REQ-013"],
  },
  {
    name: "RedFlag",
    fields: ["id : uuid", "interaction_id : uuid → InteractionRecord", "flag_type : string", "confidence : enum(uncertain, likely)"],
    reqs: ["REQ-003", "REQ-005", "REQ-015"],
  },
  {
    name: "ManualReview",
    fields: [
      "id : uuid",
      "target_type : enum(InteractionRecord, RedFlag, IngestionBatch)",
      "target_id : uuid",
      "reviewer_id : uuid",
      "decision : string",
      "reviewed_at : datetime",
    ],
    reqs: ["REQ-004", "REQ-005", "REQ-010"],
  },
  {
    name: "AuditLogEntry",
    fields: ["id : uuid", "manual_review_id : uuid → ManualReview", "action : string", "logged_at : datetime"],
    reqs: ["REQ-018"],
  },
  {
    name: "TrialFeedback",
    fields: ["id : uuid", "job_seeker_id : uuid → JobSeeker", "submitted_at : datetime", "rating : integer", "comments : text"],
    reqs: ["REQ-016", "REQ-017"],
  },
];

const DATA_MODEL_RELATIONSHIPS = [
  "JobSeeker 1&mdash;* IngestionBatch (a job seeker uploads one or more files)",
  "IngestionBatch 1&mdash;* InteractionRecord (a clean batch produces interaction records)",
  "Recruiter 1&mdash;* InteractionRecord (REQ-007: correct attribution)",
  "InteractionRecord 1&mdash;* RedFlag (REQ-003: highlighted for review)",
  "RedFlag / InteractionRecord / IngestionBatch 1&mdash;* ManualReview (REQ-004, REQ-010: polymorphic target)",
  "ManualReview 1&mdash;* AuditLogEntry (REQ-018: every review is logged)",
  "JobSeeker 1&mdash;* TrialFeedback (REQ-016, REQ-017)",
];

function entityCard(e) {
  const reqLinks = e.reqs.map((id) => `<a href="#/kb/requirement/${id}">${id}</a>`).join(", ");
  return `
    <div class="entity">
      <div class="entity-name">${e.name}</div>
      <ul>${e.fields.map((f) => {
        const [name, rest] = f.split(" : ");
        return `<li><b>${name}</b> : ${rest}</li>`;
      }).join("")}</ul>
      <div style="padding:0 14px 10px;font-size:11.5px;color:var(--muted)">from ${reqLinks}</div>
    </div>`;
}

function renderDataModel() {
  return `
    <h1>9. Data model</h1>
    <div class="banner"><span class="banner-title">Draft, not a live schema</span>
      These entities are proposed from the requirements below. Nothing here has been created in
      <code>backend/src/models</code> yet &mdash; that is a deliberate later step, reviewed before it happens.</div>
    <div class="grid cols-2">${DATA_MODEL_ENTITIES.map(entityCard).join("")}</div>
    <h2>Relationships</h2>
    <ul class="rel-list">${DATA_MODEL_RELATIONSHIPS.map((r) => `<li>${r}</li>`).join("")}</ul>`;
}
