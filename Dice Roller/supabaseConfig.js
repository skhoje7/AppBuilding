export const STORAGE_KEY = 'dice-roller.supabase';

const DEFAULT_CONFIG = Object.freeze({
  url: '',
  key: '',
  table: 'dice_rolls',
  email: '',
  enabled: false
});

export function loadConfig(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      url: parsed.url ?? '',
      key: parsed.key ?? '',
      table: parsed.table ?? 'dice_rolls',
      email: parsed.email ?? '',
      enabled: Boolean(parsed.enabled)
    };
  } catch (error){
    console.warn('Failed to load Supabase config', error);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config){
  const toStore = {
    url: config.url ?? '',
    key: config.key ?? '',
    table: config.table ? config.table : 'dice_rolls',
    email: config.email ?? '',
    enabled: Boolean(config.enabled)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

export function isConfigComplete(config){
  return Boolean(config?.url && config?.key && config?.table);
}

export function withDefaultConfig(overrides = {}){
  return { ...DEFAULT_CONFIG, ...overrides };
}
