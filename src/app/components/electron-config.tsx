/**
 * Electron runtime helpers for detecting and using native APIs.
 * The actual Electron main/preload processes live in electron/*.cjs.
 */

export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

/**
 * Helper: Save file via native dialog (Electron) or download (browser)
 */
export async function saveFileNative(
  data: string,
  defaultName: string,
  filters?: { name: string; extensions: string[] }[]
): Promise<boolean> {
  if (isElectron()) {
    const result = await (window as any).electronAPI.saveFile({
      data,
      defaultName,
      filters,
    });
    return result.success;
  }
  // Browser fallback: download link
  const a = document.createElement("a");
  a.href = data;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

/**
 * Helper: Open file via native dialog (Electron) or file input (browser)
 */
export async function openFileNative(
  filters?: { name: string; extensions: string[] }[]
): Promise<{ type: "image" | "project"; data: string } | null> {
  if (isElectron()) {
    const result = await (window as any).electronAPI.openFile({ filters });
    if (result.success) {
      return { type: result.type, data: result.data };
    }
    return null;
  }
  // Browser fallback: file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.aicproj";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        const type = file.name.endsWith(".aicproj") ? "project" : "image";
        resolve({ type, data });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
