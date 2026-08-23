import { useState } from "react";
import { Globe2 } from "lucide-react";

// Windows (pre-24H2 builds, and most Chrome/Edge installs) has no color
// flag-emoji glyphs in its default font — a flag like 🇯🇵 silently falls
// back to rendering the raw two-letter regional-indicator text ("JP")
// instead of an actual flag, which is why the switch dialog showed letters
// instead of flags. Flag emoji are always exactly two "regional indicator
// symbol" code points, each offset from 'A'..'Z' by 0x1F1E6 — decode them
// back to an ISO 3166-1 alpha-2 code so we can render a real flag image.
function flagEmojiToIso2(flag: string | null | undefined): string | null {
  if (!flag) return null;
  const points = Array.from(flag).map((c) => c.codePointAt(0) ?? 0);
  if (points.length !== 2) return null;
  const letters = points.map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65));
  if (letters.some((l) => l < "A" || l > "Z")) return null;
  return letters.join("").toLowerCase();
}

export function FlagIcon({
  flagEmoji,
  size = 20,
  className = "",
}: {
  flagEmoji?: string | null;
  size?: number;
  className?: string;
}) {
  const iso2 = flagEmojiToIso2(flagEmoji);
  const [imgFailed, setImgFailed] = useState(false);

  if (iso2 && !imgFailed) {
    return (
      <img
        src={`https://flagcdn.com/w40/${iso2}.png`}
        srcSet={`https://flagcdn.com/w80/${iso2}.png 2x`}
        alt=""
        width={size}
        height={size * 0.75}
        className={`rounded-[3px] object-cover shadow-sm ${className}`}
        style={{ width: size, height: size * 0.75 }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // Non-DO-region custom flags (no valid ISO2) or a failed image load —
  // fall back to the emoji itself, then a generic globe icon.
  if (flagEmoji) {
    return (
      <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1 }}>
        {flagEmoji}
      </span>
    );
  }

  return <Globe2 size={size * 0.8} className={`text-muted-foreground ${className}`} />;
}
