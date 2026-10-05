/**
 * Helpers for clipboard paste events, extracting images from clipboard data
 * (Snipping Tool, print-screen, copied image files, browser image copies),
 * while preserving standard text pasting into inputs and textareas.
 */

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Extracts image files from a ClipboardEvent.
 * Checks event.clipboardData.files first, then falls back to event.clipboardData.items.
 */
export function extractImageFiles(event: ClipboardEvent): File[] {
  const dt = event.clipboardData;
  if (!dt) return [];

  const files: File[] = [];

  // 1. Check dt.files (populated by copied files, screenshots in modern browsers)
  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files.item(i);
      if (f && isImageFile(f)) {
        files.push(f);
      }
    }
  }

  // 2. Fallback to dt.items if no files found in dt.files
  if (files.length === 0 && dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f && isImageFile(f)) {
          files.push(f);
        }
      }
    }
  }

  return files;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || ACCEPTED_IMAGE_TYPES.includes(file.type);
}

/**
 * Determines whether the paste event is intended as normal text editing inside
 * an active text input, textarea, or contenteditable element.
 *
 * If the user is typing in a text field and pastes plain text, we return true
 * so the caller lets the browser perform default text pasting.
 * If the user pastes an image while in a text field, we return false because
 * text inputs cannot accept images, and the user intended to add the screenshot.
 */
export function isTextPasteInInput(event: ClipboardEvent): boolean {
  const active = document.activeElement;
  if (!active) return false;

  const tag = active.tagName.toLowerCase();
  const isTextInput = tag === 'input' || tag === 'textarea' || active.getAttribute('contenteditable') === 'true';
  if (!isTextInput) return false;

  // If there is plain text in the clipboard, allow normal text paste into the field.
  const text = event.clipboardData?.getData('text/plain');
  return Boolean(text && text.trim().length > 0);
}

/**
 * Assigns friendly sequential names (e.g. Screenshot 1.png) to pasted screenshots
 * that have generic browser-assigned names like "image.png" or "blob".
 */
export function normalizePastedFiles(files: File[], startIndex = 0): File[] {
  return files.map((file, idx) => {
    const isGeneric = !file.name || file.name === 'image.png' || file.name === 'blob' || file.name === 'image';
    if (!isGeneric) return file;

    const ext = file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/webp' ? '.webp' : '.png';
    const friendlyName = `Screenshot ${startIndex + idx + 1}${ext}`;
    return new File([file], friendlyName, { type: file.type });
  });
}
