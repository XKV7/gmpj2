/** 메시지 내용을 미리보기·알림용 한 줄 텍스트로 (멘션은 이름으로, 마크다운 기호는 제거) */
export function toPlainText(content: string, nameOf: (id: number) => string): string {
  return content
    .replace(/```[\w+#.-]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim().split('\n')[0] ?? '')
    .replace(/<@(\d+)>/g, (_, id: string) => `@${nameOf(Number(id))}`)
    .replace(/<@everyone>/g, '@모두')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '🖼 $1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
