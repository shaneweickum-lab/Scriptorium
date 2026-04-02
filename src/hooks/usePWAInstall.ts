import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallMethod = 'prompt' | 'safari-mac' | 'safari-ios' | null;

function detectInstallMethod(): InstallMethod {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isSafariMac =
    /Macintosh/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|CriOS|OPR|Edg/.test(ua);
  if (isIOS) return 'safari-ios';
  if (isSafariMac) return 'safari-mac';
  return 'prompt'; // Chrome/Edge/Firefox on Windows, Mac, Android
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installMethod] = useState<InstallMethod>(detectInstallMethod);

  useEffect(() => {
    // Already running as a standalone PWA
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
  };

  // For Chrome/Edge: show button once the browser fires beforeinstallprompt
  // For Safari: always show the button so users can get instructions
  const canInstall =
    !isInstalled &&
    (installMethod === 'safari-ios' ||
      installMethod === 'safari-mac' ||
      !!installPrompt);

  return { canInstall, install, installMethod };
}
