import { useEffect } from "react";
import { useAppStore } from "../store/appStore";

export function SettingsPage() {
  const { openSettings } = useAppStore();

  useEffect(() => {
    openSettings();
  }, [openSettings]);

  return null;
}
