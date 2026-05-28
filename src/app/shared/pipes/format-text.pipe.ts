import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Renders comment/reply text with limited markdown:
 *   **bold**  → <strong>bold</strong>
 *   *italic*  → <em>italic</em>
 *   > quote   → <blockquote>quote</blockquote>
 * Also converts newlines to <br> and linkifies @mentions.
 */
@Pipe({ name: 'formatText' })
export class FormatTextPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';

    // 1. Separate quote lines before escaping so > isn't mangled
    const lines = text.split('\n');
    const processed = lines.map(line => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('> ')) {
        const inner = this.escapeHtml(trimmed.slice(2));
        return `<blockquote class="comment-quote">${this.inlineMarkdown(inner)}</blockquote>`;
      }
      return this.inlineMarkdown(this.escapeHtml(line));
    });

    const html = processed.join('<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private inlineMarkdown(s: string): string {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>');
  }
}
