import { useEffect } from "react";
import { isElectron } from "./electron-config";

type ElectronMenuAction = "new" | "open" | "save" | "export-png";

const VALID_ACTIONS: ElectronMenuAction[] = ["new", "open", "save", "export-png"];

export function useElectronMenu() {
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) return;

    const api = window.electronAPI;

    api.onMenuAction((action: string) => {
      if (VALID_ACTIONS.includes(action as ElectronMenuAction)) {
        window.dispatchEvent(
          new CustomEvent<ElectronMenuAction>("electron-menu", {
            detail: action as ElectronMenuAction,
          }),
        );
      }
    });

    return () => {
      api.removeMenuActionListeners();
    };
  }, []);
}
