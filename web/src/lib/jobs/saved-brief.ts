import { ASPECTS, DURATION_OPTIONS, LANGUAGES, VOICES } from "./options";
import { sanitizeCaptionStyle, type CaptionStyle } from "./scenes";

// Brief adımındaki "Save settings" seçeneği: işaretliyse ayarlar tarayıcıda
// tutulur ve oluştur sayfası her açıldığında geri yüklenir. Konu metni bilerek
// dışarıda; her videoda değişiyor.
export const SAVED_SETTINGS_KEY = "reelate:brief-settings:v1";

export type SavedSettings = {
  language: string;
  voice: string;
  aspect: string;
  targetSeconds: number;
  captionStyle: CaptionStyle;
};

type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_ASPECT = "9:16";
const DEFAULT_SECONDS = 60;

export function parseSavedSettings(raw: string | null): SavedSettings | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  // Liste zamanla değişebilir; artık sunulmayan değerler varsayılana düşer.
  const language = LANGUAGES.some((l) => l.code === obj.language)
    ? String(obj.language)
    : DEFAULT_LANGUAGE;
  const voice = VOICES.some((v) => v.id === obj.voice && v.language === language)
    ? String(obj.voice)
    : (VOICES.find((v) => v.language === language)?.id ?? VOICES[0].id);
  const aspect = (ASPECTS as readonly string[]).includes(String(obj.aspect))
    ? String(obj.aspect)
    : DEFAULT_ASPECT;
  const targetSeconds = (DURATION_OPTIONS as readonly number[]).includes(
    Number(obj.targetSeconds),
  )
    ? Number(obj.targetSeconds)
    : DEFAULT_SECONDS;

  return {
    language,
    voice,
    aspect,
    targetSeconds,
    captionStyle: sanitizeCaptionStyle(obj.captionStyle),
  };
}

// Gizli sekme / engellenmiş site verisi gibi durumlarda Storage erişimi
// fırlatabilir; bu yardımcılar hiçbir zaman sayfayı düşürmez.
export function loadSavedSettings(storage: SettingsStorage | undefined): SavedSettings | null {
  try {
    return parseSavedSettings(storage?.getItem(SAVED_SETTINGS_KEY) ?? null);
  } catch {
    return null;
  }
}

export function storeSettings(storage: SettingsStorage | undefined, s: SavedSettings) {
  const record: SavedSettings = {
    language: s.language,
    voice: s.voice,
    aspect: s.aspect,
    targetSeconds: s.targetSeconds,
    captionStyle: s.captionStyle,
  };
  try {
    storage?.setItem(SAVED_SETTINGS_KEY, JSON.stringify(record));
  } catch {
    // yoksay
  }
}

export function clearSavedSettings(storage: SettingsStorage | undefined) {
  try {
    storage?.removeItem(SAVED_SETTINGS_KEY);
  } catch {
    // yoksay
  }
}
