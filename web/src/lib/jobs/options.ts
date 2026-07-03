export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

// Motor ses adı formatı: <locale>-<Name>Neural-<Gender> (app/services/voice.py)
export const VOICES = [
  { id: "en-US-JennyNeural-Female", label: "Jenny (US, Female)", language: "en" },
  { id: "en-US-GuyNeural-Male", label: "Guy (US, Male)", language: "en" },
  { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK, Female)", language: "en" },
  { id: "tr-TR-EmelNeural-Female", label: "Emel (TR, Female)", language: "tr" },
  { id: "tr-TR-AhmetNeural-Male", label: "Ahmet (TR, Male)", language: "tr" },
] as const;

export const ASPECTS = ["9:16", "16:9", "1:1"] as const;
export const DURATION_OPTIONS = [30, 60, 90, 180] as const;
export const MAX_SCRIPT_WORDS = 1200;
