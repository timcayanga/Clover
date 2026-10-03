import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportUploadDock } from "../components/import-upload-dock";
import { getImportStageLabel } from "../../shared/import-stage";
import { ReceiptDraftEditorView } from "../components/receipt-draft-editor";
import type { ReceiptDraftPreview } from "../../shared/receipt-draft";

const base = { open: true, fileName: "private-receipt.jpg", fileIndex: 1, fileTotal: 1, completedFiles: 0, progress: 45,
  detail: "Clover is reading receipt details. You can keep using Clover.", canControl: true,
  onPauseToggle: () => {}, onCancel: () => {}, onClose: () => {} };
const active = renderToStaticMarkup(<ImportUploadDock {...base}/>);
assert.match(active, /Reading file/);
assert.match(active, /aria-label="Pause import"/);
assert.match(active, /aria-label="Cancel import"/);
assert.doesNotMatch(active, /private-receipt|keep using|>45%<|import-progress-donut/);
assert.equal((active.match(/role="progressbar"/g) || []).length, 1);
assert.match(active, /aria-valuenow="45"/);
const paused = renderToStaticMarkup(<ImportUploadDock {...base} paused/>);
assert.match(paused, /Import paused/);
assert.match(paused, /aria-label="Resume import"/);
const incomplete = renderToStaticMarkup(<ImportUploadDock {...base} progress={100}/>);
assert.doesNotMatch(incomplete, /aria-valuenow="100"/);
const complete = renderToStaticMarkup(<ImportUploadDock {...base} tone="success" completedFiles={1} progress={100}/>);
assert.match(complete, /Import complete/);
assert.match(complete, /aria-valuenow="100"/);
assert.match(complete, /aria-label="Dismiss import progress"/);
assert.doesNotMatch(complete, /aria-label="Pause import"|aria-label="Cancel import"/);
const review = renderToStaticMarkup(<ImportUploadDock {...base} tone="error" errorTitle="Receipt needs review" reviewImportId="qa-partial-receipt"/>);
assert.match(review, /Receipt needs review/);
assert.match(review, />Review receipt<\/button>/);
assert.doesNotMatch(active, />Review receipt<\/button>/);
const ordinaryFailure = renderToStaticMarkup(<ImportUploadDock {...base} tone="error"/>);
assert.doesNotMatch(ordinaryFailure, />Review receipt<\/button>/);
assert.equal(getImportStageLabel("Import paused", 90), "Import paused");
assert.equal(getImportStageLabel("Waiting for connection", 90), "Waiting for connection");
assert.equal(getImportStageLabel("Reading receipt details", 80), "Reading file");
assert.equal(getImportStageLabel("Retrying save", 90), "Retrying save");
console.log("Compact import progress renders only its stage and one bar; pause, resume, cancellation and completion semantics pass.");

const preview: ReceiptDraftPreview = {
  importId: "partial", canEdit: true, transactionId: null,
  fields: { merchant: "Coffee", date: "2026-10-04", amount: "", currency: "PHP", accountId: "cash", categoryId: "" },
  accounts: [{ id: "cash", name: "Cash", currency: "PHP" }], categories: [],
};
const draftProps = { preview: null, fields: null, expected: true, error: "", busy: false, reload: () => {}, update: () => {}, save: async () => {} };
const loadingDraft = renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps}/>);
assert.match(loadingDraft, /Loading receipt/);
assert.match(loadingDraft, /aria-busy="true"/);
const failedDraft = renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps} error="Connection failed"/>);
assert.match(failedDraft, /role="alert"/);
assert.match(failedDraft, /Reload receipt/);
assert.doesNotMatch(failedDraft, /Loading receipt/);
const savedDraft = renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps} preview={{...preview,canEdit:false,transactionId:"saved"}} fields={preview.fields}/>);
assert.match(savedDraft, /already saved/);
assert.match(savedDraft, /View transactions/);
assert.doesNotMatch(savedDraft, /<input|Save transaction/);
const unavailableDraft = renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps} preview={{...preview,canEdit:false}} fields={preview.fields}/>);
assert.match(unavailableDraft, /not available to edit/);
assert.match(unavailableDraft, /Reload receipt/);
assert.doesNotMatch(unavailableDraft, /Loading receipt|<input/);
const savingDraft = renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps} preview={preview} fields={preview.fields} busy/>);
assert.match(savingDraft, /<fieldset disabled=""/);
assert.match(savingDraft, /Saving…/);
assert.match(savingDraft, /aria-busy="true"/);
assert.equal(renderToStaticMarkup(<ReceiptDraftEditorView {...draftProps} expected={false} error="Not a receipt"/>), "");
console.log("Receipt editor renders explicit loading, retry, already-saved, unavailable and disabled saving states.");
