export type CardDraft = {
  name: string;
  role: string;
  skills: string;
  interests: string;
  bio: string;
};

export const CARD_STORAGE_KEY = "blackbox.card.draft.v1";
export const CARD_STORAGE_VERSION = 1;

export const CARD_LIMITS = {
  name: 24,
  role: 32,
  skills: 80,
  interests: 80,
  bio: 160,
} as const;

export const EMPTY_CARD: CardDraft = {
  name: "",
  role: "",
  skills: "",
  interests: "",
  bio: "",
};

export function serializeCardDraft(draft: CardDraft): string {
  return JSON.stringify({ version: CARD_STORAGE_VERSION, draft });
}

export function parseCardDraft(value: string): CardDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("名片草稿不是有效 JSON。");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("名片草稿结构无效。");
  }
  const envelope = parsed as { version?: unknown; draft?: unknown };
  if (envelope.version !== CARD_STORAGE_VERSION || !envelope.draft || typeof envelope.draft !== "object" || Array.isArray(envelope.draft)) {
    throw new Error("名片草稿版本或结构无效。");
  }

  const draft = envelope.draft as Record<string, unknown>;
  const restored = {} as CardDraft;
  for (const name of Object.keys(CARD_LIMITS) as Array<keyof CardDraft>) {
    const field = draft[name];
    if (typeof field !== "string" || field.length > CARD_LIMITS[name]) {
      throw new Error(`名片草稿字段 ${name} 无效。`);
    }
    restored[name] = field;
  }
  return restored;
}

const TAG_SEPARATOR = /[,，、;；\n]+/;

export function normalizeText(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function getCardContent(draft: CardDraft) {
  return {
    name: normalizeText(draft.name, CARD_LIMITS.name),
    role: normalizeText(draft.role, CARD_LIMITS.role),
    skills: splitTags(draft.skills, CARD_LIMITS.skills),
    interests: splitTags(draft.interests, CARD_LIMITS.interests),
    bio: normalizeText(draft.bio, CARD_LIMITS.bio),
  };
}

export function hasCardContent(draft: CardDraft) {
  const content = getCardContent(draft);
  return Boolean(
    content.name ||
      content.role ||
      content.skills.length ||
      content.interests.length ||
      content.bio,
  );
}

export function splitTags(value: string, limit = value.length) {
  return value
    .slice(0, limit)
    .split(TAG_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

type CardContent = ReturnType<typeof getCardContent>;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";

  for (const character of characters) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }

  if (lines.length < maxLines && line) lines.push(line.trimEnd());
  const consumed = lines.join("").length;
  if (consumed < characters.length && lines.length) {
    lines[lines.length - 1] = fitText(
      context,
      `${lines[lines.length - 1]}…`,
      maxWidth,
    );
  }
  return lines;
}

function drawTagRow(
  context: CanvasRenderingContext2D,
  label: string,
  tags: string[],
  y: number,
) {
  context.font = '600 22px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillStyle = "#c9bfff";
  context.fillText(label, 92, y + 29);

  let x = 188;
  const availableWidth = 920;
  const maxX = 92 + availableWidth;
  const displayed = tags.length ? tags : ["待补充"];

  for (const [index, rawTag] of displayed.entries()) {
    const tag = fitText(context, rawTag, 180);
    const width = Math.min(context.measureText(tag).width + 34, 214);
    if (x + width > maxX) {
      context.fillStyle = "#9788ff";
      context.fillText(`+${displayed.length - index}`, x, y + 29);
      break;
    }
    context.fillStyle = tags.length ? "#28233d" : "#211d31";
    roundedRect(context, x, y, width, 44, 22);
    context.fillStyle = tags.length ? "#f2efff" : "#777087";
    context.fillText(tag, x + 17, y + 29);
    x += width + 10;
  }
}

export function drawCard(canvas: HTMLCanvasElement, draft: CardDraft) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法创建图片画布。");

  const content: CardContent = getCardContent(draft);
  canvas.width = 1200;
  canvas.height = 675;

  const gradient = context.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, "#17131f");
  gradient.addColorStop(0.62, "#12101a");
  gradient.addColorStop(1, "#09080d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 675);

  context.save();
  context.translate(1040, -15);
  context.rotate(0.2);
  context.fillStyle = "#b7ff3c";
  context.fillRect(0, 0, 210, 40);
  context.restore();

  context.strokeStyle = "rgba(183, 255, 60, 0.15)";
  context.lineWidth = 1;
  for (let x = 50; x < 1200; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x - 220, 675);
    context.stroke();
  }

  const statusLabel = "OPEN TO TEAM";
  context.font = '800 20px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.letterSpacing = "2px";
  const statusPadding = 18;
  const statusWidth = context.measureText(statusLabel).width + statusPadding * 2;
  context.fillStyle = "#b7ff3c";
  roundedRect(context, 78, 64, statusWidth, 42, 21);
  context.fillStyle = "#15111e";
  context.fillText(statusLabel, 78 + statusPadding, 92);
  context.letterSpacing = "0px";

  context.fillStyle = "#777087";
  context.font = '600 20px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = "right";
  context.fillText("黑箱 / 001", 1120, 92);
  context.textAlign = "left";

  context.fillStyle = "#faf8ff";
  context.font = '800 68px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText(
    fitText(context, content.name || "等待你的名字", 790),
    82,
    206,
  );

  context.fillStyle = content.role ? "#b7ff3c" : "#777087";
  context.font = '650 30px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText(
    fitText(context, content.role || "你想在团队中扮演什么角色？", 890),
    84,
    258,
  );

  context.fillStyle = "#5b526c";
  context.fillRect(82, 296, 1036, 2);

  drawTagRow(context, "技能", content.skills, 332);
  drawTagRow(context, "兴趣", content.interests, 396);

  context.fillStyle = "#777087";
  context.font = '600 18px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText("ABOUT", 84, 518);

  context.fillStyle = content.bio ? "#e7e1ef" : "#777087";
  context.font = '500 25px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  const bioLines = wrapText(
    context,
    content.bio || "用一句话介绍你想做的事，或者你正在寻找的队友。",
    950,
    2,
  );
  bioLines.forEach((line, index) => context.fillText(line, 84, 558 + index * 36));

  context.fillStyle = "#b7ff3c";
  context.beginPath();
  context.arc(1088, 548, 26, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#15111e";
  context.font = '900 24px "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.fillText("+", 1088, 557);
  context.textAlign = "left";
}

export async function exportCardPng(draft: CardDraft) {
  const canvas = document.createElement("canvas");
  drawCard(canvas, draft);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result && result.size > 0) resolve(result);
      else reject(new Error("浏览器没有生成有效的 PNG 文件。"));
    }, "image/png");
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = normalizeText(draft.name, CARD_LIMITS.name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 24);
  anchor.href = url;
  anchor.download = `${safeName || "黑箱-组队名片"}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);

  return blob.size;
}
