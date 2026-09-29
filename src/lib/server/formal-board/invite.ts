import "server-only";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,96}$/;

export class InviteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteInputError";
  }
}

export function parseInviteToken(value: unknown): string {
  if (typeof value !== "string") throw new InviteInputError("请粘贴有效的邀请链接或邀请码。");
  const token = value.trim().replace(/^.*[?&]invite=/, "").split(/[&#\s]/, 1)[0];
  if (!TOKEN_PATTERN.test(token)) throw new InviteInputError("邀请链接或邀请码格式无效。");
  return token;
}
