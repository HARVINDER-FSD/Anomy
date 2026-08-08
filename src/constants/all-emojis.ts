export interface EmojiItem {
  emoji: string;
  category: 'Smileys' | 'Gestures' | 'Animals' | 'Food' | 'Travel' | 'Activities' | 'Objects' | 'Symbols';
}

// 100% Curated, Verified and Beautiful Popular Emojis to guarantee maximum support without blanks
const CURATED_EMOJIS: EmojiItem[] = [
  // === SMILEYS (Verified 100+ Faces) ===
  { emoji: '😀', category: 'Smileys' }, { emoji: '😃', category: 'Smileys' }, { emoji: '😄', category: 'Smileys' },
  { emoji: '😁', category: 'Smileys' }, { emoji: '😆', category: 'Smileys' }, { emoji: '😅', category: 'Smileys' },
  { emoji: '😂', category: 'Smileys' }, { emoji: '🤣', category: 'Smileys' }, { emoji: '🥲', category: 'Smileys' },
  { emoji: '🥹', category: 'Smileys' }, { emoji: '😊', category: 'Smileys' }, { emoji: '😇', category: 'Smileys' },
  { emoji: '🙂', category: 'Smileys' }, { emoji: '🙃', category: 'Smileys' }, { emoji: '😉', category: 'Smileys' },
  { emoji: '😌', category: 'Smileys' }, { emoji: '😍', category: 'Smileys' }, { emoji: '🥰', category: 'Smileys' },
  { emoji: '😘', category: 'Smileys' }, { emoji: '😗', category: 'Smileys' }, { emoji: '😙', category: 'Smileys' },
  { emoji: '😚', category: 'Smileys' }, { emoji: '😋', category: 'Smileys' }, { emoji: '😛', category: 'Smileys' },
  { emoji: '😝', category: 'Smileys' }, { emoji: '😜', category: 'Smileys' }, { emoji: '🤪', category: 'Smileys' },
  { emoji: '🤨', category: 'Smileys' }, { emoji: '🧐', category: 'Smileys' }, { emoji: '🤓', category: 'Smileys' },
  { emoji: '😎', category: 'Smileys' }, { emoji: '🥸', category: 'Smileys' }, { emoji: '🤩', category: 'Smileys' },
  { emoji: '🥳', category: 'Smileys' }, { emoji: '😏', category: 'Smileys' }, { emoji: '😒', category: 'Smileys' },
  { emoji: '😞', category: 'Smileys' }, { emoji: '😔', category: 'Smileys' }, { emoji: '😟', category: 'Smileys' },
  { emoji: '😕', category: 'Smileys' }, { emoji: '🙁', category: 'Smileys' }, { emoji: '☹️', category: 'Smileys' },
  { emoji: '😣', category: 'Smileys' }, { emoji: '😖', category: 'Smileys' }, { emoji: '😫', category: 'Smileys' },
  { emoji: '😩', category: 'Smileys' }, { emoji: '🥺', category: 'Smileys' }, { emoji: '😢', category: 'Smileys' },
  { emoji: '😭', category: 'Smileys' }, { emoji: '😤', category: 'Smileys' }, { emoji: '😠', category: 'Smileys' },
  { emoji: '😡', category: 'Smileys' }, { emoji: '🤬', category: 'Smileys' }, { emoji: '🤯', category: 'Smileys' },
  { emoji: '😳', category: 'Smileys' }, { emoji: '🥵', category: 'Smileys' }, { emoji: '🥶', category: 'Smileys' },
  { emoji: '😱', category: 'Smileys' }, { emoji: '😨', category: 'Smileys' }, { emoji: '😰', category: 'Smileys' },
  { emoji: '😥', category: 'Smileys' }, { emoji: '😓', category: 'Smileys' }, { emoji: '🫣', category: 'Smileys' },
  { emoji: '🤗', category: 'Smileys' }, { emoji: '🫡', category: 'Smileys' }, { emoji: '🤔', category: 'Smileys' },
  { emoji: '🤫', category: 'Smileys' }, { emoji: '🤥', category: 'Smileys' }, { emoji: '😶', category: 'Smileys' },
  { emoji: '😐', category: 'Smileys' }, { emoji: '😑', category: 'Smileys' }, { emoji: '😬', category: 'Smileys' },
  { emoji: '🫠', category: 'Smileys' }, { emoji: '🫨', category: 'Smileys' }, { emoji: '🫥', category: 'Smileys' },
  { emoji: '😯', category: 'Smileys' }, { emoji: '😦', category: 'Smileys' }, { emoji: '😧', category: 'Smileys' },
  { emoji: '😮', category: 'Smileys' }, { emoji: '😲', category: 'Smileys' }, { emoji: '🥱', category: 'Smileys' },
  { emoji: '😴', category: 'Smileys' }, { emoji: '🤤', category: 'Smileys' }, { emoji: '😪', category: 'Smileys' },
  { emoji: '😵', category: 'Smileys' }, { emoji: '😵‍💫', category: 'Smileys' }, { emoji: '🤐', category: 'Smileys' },
  { emoji: '🥴', category: 'Smileys' }, { emoji: '🤢', category: 'Smileys' }, { emoji: '🤮', category: 'Smileys' },
  { emoji: '🤧', category: 'Smileys' }, { emoji: '😷', category: 'Smileys' }, { emoji: '🤒', category: 'Smileys' },
  { emoji: '🤕', category: 'Smileys' }, { emoji: '🤑', category: 'Smileys' }, { emoji: '🤠', category: 'Smileys' },
  { emoji: '😈', category: 'Smileys' }, { emoji: '👿', category: 'Smileys' }, { emoji: '👹', category: 'Smileys' },
  { emoji: '👺', category: 'Smileys' }, { emoji: '🤡', category: 'Smileys' }, { emoji: '💩', category: 'Smileys' },
  { emoji: '👻', category: 'Smileys' }, { emoji: '💀', category: 'Smileys' }, { emoji: '☠️', category: 'Smileys' },
  { emoji: '👽', category: 'Smileys' }, { emoji: '👾', category: 'Smileys' }, { emoji: '🤖', category: 'Smileys' },
  { emoji: '🎃', category: 'Smileys' }, { emoji: '😺', category: 'Smileys' }, { emoji: '😸', category: 'Smileys' },
  { emoji: '😹', category: 'Smileys' }, { emoji: '😻', category: 'Smileys' }, { emoji: '😼', category: 'Smileys' },
  { emoji: '😽', category: 'Smileys' }, { emoji: '🙀', category: 'Smileys' }, { emoji: '😿', category: 'Smileys' },
  { emoji: '😾', category: 'Smileys' },

  // === GESTURES & HANDS ===
  { emoji: '👋', category: 'Gestures' }, { emoji: '🤚', category: 'Gestures' }, { emoji: '🖐️', category: 'Gestures' },
  { emoji: '✋', category: 'Gestures' }, { emoji: '🖖', category: 'Gestures' }, { emoji: '👌', category: 'Gestures' },
  { emoji: '🤌', category: 'Gestures' }, { emoji: '🤏', category: 'Gestures' }, { emoji: '✌️', category: 'Gestures' },
  { emoji: '🤞', category: 'Gestures' }, { emoji: '🫰', category: 'Gestures' }, { emoji: '🤟', category: 'Gestures' },
  { emoji: '🤘', category: 'Gestures' }, { emoji: '🤙', category: 'Gestures' }, { emoji: '👈', category: 'Gestures' },
  { emoji: '👉', category: 'Gestures' }, { emoji: '👆', category: 'Gestures' }, { emoji: '🖕', category: 'Gestures' },
  { emoji: '👇', category: 'Gestures' }, { emoji: '☝️', category: 'Gestures' }, { emoji: '👍', category: 'Gestures' },
  { emoji: '👎', category: 'Gestures' }, { emoji: '✊', category: 'Gestures' }, { emoji: '👊', category: 'Gestures' },
  { emoji: '🤛', category: 'Gestures' }, { emoji: '🤜', category: 'Gestures' }, { emoji: '👏', category: 'Gestures' },
  { emoji: '🙌', category: 'Gestures' }, { emoji: '👐', category: 'Gestures' }, { emoji: '🤲', category: 'Gestures' },
  { emoji: '🤝', category: 'Gestures' }, { emoji: '🙏', category: 'Gestures' }, { emoji: '✍️', category: 'Gestures' },
  { emoji: '💅', category: 'Gestures' }, { emoji: '🤳', category: 'Gestures' }, { emoji: '💪', category: 'Gestures' },
  { emoji: '🦾', category: 'Gestures' }, { emoji: '🦿', category: 'Gestures' }, { emoji: '🦵', category: 'Gestures' },
  { emoji: '🦶', category: 'Gestures' }, { emoji: '👂', category: 'Gestures' }, { emoji: '🦻', category: 'Gestures' },
  { emoji: '👃', category: 'Gestures' }, { emoji: '🧠', category: 'Gestures' }, { emoji: '🫀', category: 'Gestures' },
  { emoji: '🫁', category: 'Gestures' }, { emoji: '🦷', category: 'Gestures' }, { emoji: '🦴', category: 'Gestures' },
  { emoji: '👀', category: 'Gestures' }, { emoji: '👁️', category: 'Gestures' }, { emoji: '👅', category: 'Gestures' },
  { emoji: '👄', category: 'Gestures' }, { emoji: '🫦', category: 'Gestures' }, { emoji: '💋', category: 'Gestures' },
  { emoji: '🩸', category: 'Gestures' },

  // === ANIMALS & NATURE ===
  { emoji: '🐶', category: 'Animals' }, { emoji: '🐱', category: 'Animals' }, { emoji: '🐭', category: 'Animals' },
  { emoji: '🐹', category: 'Animals' }, { emoji: '🐰', category: 'Animals' }, { emoji: '🦊', category: 'Animals' },
  { emoji: '🐻', category: 'Animals' }, { emoji: '🐼', category: 'Animals' }, { emoji: '🐨', category: 'Animals' },
  { emoji: '🐯', category: 'Animals' }, { emoji: '🦁', category: 'Animals' }, { emoji: '🐮', category: 'Animals' },
  { emoji: '🐷', category: 'Animals' }, { emoji: '🐸', category: 'Animals' }, { emoji: '🐒', category: 'Animals' },
  { emoji: '🐔', category: 'Animals' }, { emoji: '🐧', category: 'Animals' }, { emoji: '🐦', category: 'Animals' },
  { emoji: '🐤', category: 'Animals' }, { emoji: '🦆', category: 'Animals' }, { emoji: '🦅', category: 'Animals' },
  { emoji: '🦉', category: 'Animals' }, { emoji: '🐺', category: 'Animals' }, { emoji: '🐝', category: 'Animals' },
  { emoji: '🦋', category: 'Animals' }, { emoji: '🐌', category: 'Animals' }, { emoji: '🐞', category: 'Animals' },
  { emoji: '🐜', category: 'Animals' }, { emoji: '🕷️', category: 'Animals' }, { emoji: '🐢', category: 'Animals' },
  { emoji: '🐍', category: 'Animals' }, { emoji: '🦎', category: 'Animals' }, { emoji: '🐙', category: 'Animals' },
  { emoji: '🦑', category: 'Animals' }, { emoji: '🦀', category: 'Animals' }, { emoji: '🐠', category: 'Animals' },
  { emoji: '🐟', category: 'Animals' }, { emoji: '🐬', category: 'Animals' }, { emoji: '🐳', category: 'Animals' },
  { emoji: '🦈', category: 'Animals' }, { emoji: '🐊', category: 'Animals' }, { emoji: '🐅', category: 'Animals' },
  { emoji: '🐆', category: 'Animals' }, { emoji: '🦓', category: 'Animals' }, { emoji: '🦍', category: 'Animals' },
  { emoji: '🐘', category: 'Animals' }, { emoji: '🦒', category: 'Animals' }, { emoji: '🦘', category: 'Animals' },
  { emoji: '🌴', category: 'Animals' }, { emoji: '🍀', category: 'Animals' }, { emoji: '🌸', category: 'Animals' },
  { emoji: '🌹', category: 'Animals' }, { emoji: '🌻', category: 'Animals' }, { emoji: '🍁', category: 'Animals' },

  // === FOOD & DRINK ===
  { emoji: '🍏', category: 'Food' }, { emoji: '🍎', category: 'Food' }, { emoji: '🍐', category: 'Food' },
  { emoji: '🍊', category: 'Food' }, { emoji: '🍋', category: 'Food' }, { emoji: '🍌', category: 'Food' },
  { emoji: '🍉', category: 'Food' }, { emoji: '🍇', category: 'Food' }, { emoji: '🍓', category: 'Food' },
  { emoji: '🍈', category: 'Food' }, { emoji: '🍒', category: 'Food' }, { emoji: '🍑', category: 'Food' },
  { emoji: '🍍', category: 'Food' }, { emoji: '🥝', category: 'Food' }, { emoji: '🍅', category: 'Food' },
  { emoji: '🍆', category: 'Food' }, { emoji: '🥑', category: 'Food' }, { emoji: '🥦', category: 'Food' },
  { emoji: '🌶️', category: 'Food' }, { emoji: '🌽', category: 'Food' }, { emoji: '🥕', category: 'Food' },
  { emoji: '🥔', category: 'Food' }, { emoji: '🍞', category: 'Food' }, { emoji: '🥐', category: 'Food' },
  { emoji: '🧀', category: 'Food' }, { emoji: '🍳', category: 'Food' }, { emoji: '🥞', category: 'Food' },
  { emoji: '🥓', category: 'Food' }, { emoji: '🍔', category: 'Food' }, { emoji: '🍟', category: 'Food' },
  { emoji: '🍕', category: 'Food' }, { emoji: '🌭', category: 'Food' }, { emoji: '🌮', category: 'Food' },
  { emoji: '🍿', category: 'Food' }, { emoji: '🍨', category: 'Food' }, { emoji: '🍰', category: 'Food' },
  { emoji: '🍪', category: 'Food' }, { emoji: '🍩', category: 'Food' }, { emoji: '🍯', category: 'Food' },
  { emoji: '☕', category: 'Food' }, { emoji: '🍵', category: 'Food' }, { emoji: '🥤', category: 'Food' },
  { emoji: '🍺', category: 'Food' }, { emoji: '🍷', category: 'Food' }, { emoji: '🍸', category: 'Food' },

  // === SYMBOLS ===
  { emoji: '❤️', category: 'Symbols' }, { emoji: '🧡', category: 'Symbols' }, { emoji: '💛', category: 'Symbols' },
  { emoji: '💚', category: 'Symbols' }, { emoji: '💙', category: 'Symbols' }, { emoji: '💜', category: 'Symbols' },
  { emoji: '🖤', category: 'Symbols' }, { emoji: '🤍', category: 'Symbols' }, { emoji: '🤎', category: 'Symbols' },
  { emoji: '💔', category: 'Symbols' }, { emoji: '❣️', category: 'Symbols' }, { emoji: '💕', category: 'Symbols' },
  { emoji: '💞', category: 'Symbols' }, { emoji: '💖', category: 'Symbols' }, { emoji: '💗', category: 'Symbols' },
  { emoji: '💘', category: 'Symbols' }, { emoji: '💌', category: 'Symbols' }, { emoji: '🌟', category: 'Symbols' },
  { emoji: '✨', category: 'Symbols' }, { emoji: '⚡', category: 'Symbols' }, { emoji: '💥', category: 'Symbols' },
  { emoji: '🔥', category: 'Symbols' }, { emoji: '💯', category: 'Symbols' }, { emoji: '🎉', category: 'Symbols' },
  { emoji: '💤', category: 'Symbols' }, { emoji: '💭', category: 'Symbols' }, { emoji: '💬', category: 'Symbols' },
  { emoji: '🔔', category: 'Symbols' }, { emoji: '🚫', category: 'Symbols' }, { emoji: '❌', category: 'Symbols' },
  { emoji: '✅', category: 'Symbols' }, { emoji: '⚠️', category: 'Symbols' }, { emoji: '🌐', category: 'Symbols' }
];

const generateAllEmojis = (): EmojiItem[] => {
  const list: EmojiItem[] = [];
  const seen = new Set<string>();

  const add = (emoji: string, category: EmojiItem['category']) => {
    if (!seen.has(emoji) && emoji.trim()) {
      seen.add(emoji);
      list.push({ emoji, category });
    }
  };

  // 1. Populate hand-curated guaranteed highly popular emojis first
  CURATED_EMOJIS.forEach(item => add(item.emoji, item.category));

  // Helper to add ranges dynamically
  const addRange = (start: number, end: number, category: EmojiItem['category']) => {
    for (let cp = start; cp <= end; cp++) {
      try {
        const emoji = String.fromCodePoint(cp);
        add(emoji, category);
      } catch (e) {}
    }
  };

  // 2. Smileys & Faces: Extensive loop
  addRange(0x1F600, 0x1F64F, 'Smileys');
  addRange(0x1F910, 0x1F92F, 'Smileys'); 
  addRange(0x1F970, 0x1F97F, 'Smileys'); 
  addRange(0x1F9D0, 0x1F9DF, 'Smileys'); 

  // 3. Hand Gestures, Body & Extra Hearts
  addRange(0x1F440, 0x1F48F, 'Gestures');
  addRange(0x1F490, 0x1F49F, 'Symbols'); 
  addRange(0x1F90F, 0x1F90F, 'Gestures'); 
  addRange(0x1F91A, 0x1F91F, 'Gestures'); 
  addRange(0x1F930, 0x1F93F, 'Gestures'); 
  addRange(0x1FA70, 0x1FA7C, 'Symbols'); 

  // 4. Animals & Nature
  addRange(0x1F400, 0x1F43F, 'Animals'); 
  addRange(0x1F980, 0x1F9AE, 'Animals'); 
  addRange(0x1F9B0, 0x1F9B9, 'Animals'); 
  addRange(0x1F330, 0x1F353, 'Animals'); 
  addRange(0x1F300, 0x1F30F, 'Animals'); // Blossoms, flowers

  // 5. Food & Drinks
  addRange(0x1F354, 0x1F37F, 'Food'); 
  addRange(0x1F950, 0x1F96F, 'Food'); 
  addRange(0x1F9C0, 0x1F9CF, 'Food'); 

  // 6. Travel & Weather
  addRange(0x1F300, 0x1F32F, 'Travel'); 
  addRange(0x1F680, 0x1F6FF, 'Travel'); 

  // 7. Activities & Sports
  addRange(0x1F380, 0x1F3CF, 'Activities'); 
  addRange(0x1F940, 0x1F94F, 'Activities'); 

  // 8. Objects
  addRange(0x1F4A0, 0x1F5FF, 'Objects'); 
  addRange(0x1F9E0, 0x1F9FF, 'Objects'); 
  addRange(0x1FA90, 0x1FA9F, 'Objects'); 

  // 9. Symbols & Flags
  addRange(0x2600, 0x26FF, 'Symbols');   
  addRange(0x2700, 0x27BF, 'Symbols');   
  addRange(0x1F1E6, 0x1F1FF, 'Symbols'); 

  return list;
};

export const ALL_EMOJIS = generateAllEmojis();
