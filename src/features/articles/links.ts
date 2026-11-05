export function safeArticleLink(value: string) {
  return (
    /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d][\d\s()-]*|\/(?!\/)[^\s\\]*|#[A-Za-z0-9_-]+)$/.test(
      value,
    ) && !/[\u0000-\u0020\u007f]/.test(value)
  );
}
