export interface ImportPreviewPolicy {
  discardOnClose: boolean;
  discardUnselectedOnImport: boolean;
  discardRemainingOnCancel: boolean;
}

export const NEW_IMPORT_PREVIEW_POLICY: ImportPreviewPolicy = {
  discardOnClose: true,
  discardUnselectedOnImport: true,
  discardRemainingOnCancel: true,
};

export const PENDING_IMPORT_PREVIEW_POLICY: ImportPreviewPolicy = {
  discardOnClose: false,
  discardUnselectedOnImport: false,
  discardRemainingOnCancel: false,
};

export function shouldDiscardUnselectedImportItem(policy: ImportPreviewPolicy): boolean {
  return policy.discardUnselectedOnImport;
}

export function shouldDiscardRemainingImportItemOnCancel(policy: ImportPreviewPolicy): boolean {
  return policy.discardRemainingOnCancel;
}
