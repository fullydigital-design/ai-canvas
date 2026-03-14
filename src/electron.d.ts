export {};

declare global {
  interface Window {
    electronAPI?: {
      saveFile: (options: {
        data: string | ArrayBuffer;
        defaultName?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{ success: boolean; path?: string }>;
      openFile: (options?: {
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{
        success: boolean;
        type?: 'image' | 'project';
        data?: string;
        path?: string;
      }>;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        isPackaged: boolean;
      }>;
      onMenuAction: (callback: (action: string) => void) => void;
      removeMenuActionListeners: () => void;
      setTitle: (title: string) => void;
      isElectron: boolean;
    };
  }
}
