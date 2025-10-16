export const STORAGE_KEY = 'dice-roller.supabase';

export const SUPABASE_URL = 'https://vfliwzxidjajictcntyp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmbGl3enhpZGphamljdGNudHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjQwNjgsImV4cCI6MjA3NjA0MDA2OH0._ZfD4x4JKpNfI3DvafnevY1p8DgdypmsEmJhKO5-d50';

const DEFAULT_CONFIG = Object.freeze({
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
    table: config.table ? config.table : 'dice_rolls',
    email: config.email ?? '',
    enabled: Boolean(config.enabled)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

export function isConfigComplete(config){
  return Boolean(config?.table);
}

export function withDefaultConfig(overrides = {}){
  return { ...DEFAULT_CONFIG, ...overrides };
}
