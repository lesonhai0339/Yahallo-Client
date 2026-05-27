import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef, HostListener, OnInit
} from '@angular/core';

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: '😀', emojis: [
      '😀','😃','😄','😁','😆','🤣','😂','🙂','😉','😊',
      '😍','🥰','😘','😎','🤩','🥳','😏','😒','😔','😢',
      '😭','😤','😠','🤬','🤯','😱','😨','😰','😓','🤔',
      '🙄','😴','🤢','😷','🥺','😇','🤗','😐','😬','🥱',
    ]
  },
  {
    label: '👍', emojis: [
      '👍','👎','👏','🙏','🤜','🤛','✌️','👋','🤝','💪',
      '👀','🫶','🤲','🫡','💅','🤙','☝️','👆','👇','👉',
    ]
  },
  {
    label: '❤️', emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💗','💓',
      '💞','💕','💔','❣️','💯','⭐','🌟','✨','💫','🎉',
    ]
  },
  {
    label: '🔥', emojis: [
      '🔥','💀','🎭','📚','⚔️','🛡️','🎊','🏆','🎯','💎',
      '🌸','🌺','🍀','🌈','⚡','🌙','☀️','🌊','🍜','🎵',
    ]
  },
];

@Component({
  selector: 'app-comment-editor',
  templateUrl: './comment-editor.component.html',
  styleUrls: ['./comment-editor.component.scss']
})
export class CommentEditorComponent implements OnInit {
  @Input() placeholder = 'Viết bình luận...';
  @Input() initialValue = '';
  @Input() autoFocus = false;
  @Input() compact = false;

  @Output() submitted = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>;

  content = '';
  showEmojiPicker = false;
  emojiGroups = EMOJI_GROUPS;
  activeEmojiGroup = 0;

  ngOnInit(): void {
    this.content = this.initialValue;
  }

  ngAfterViewInit(): void {
    if (this.autoFocus) {
      setTimeout(() => this.textareaRef?.nativeElement.focus(), 50);
    }
  }

  @HostListener('document:click', ['$event'])
  closeEmojiPicker(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.emoji-picker-wrapper')) {
      this.showEmojiPicker = false;
    }
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

  wrap(prefix: string, suffix: string): void {
    const ta = this.textareaRef.nativeElement;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = this.content.slice(start, end) || 'text';
    const replacement = `${prefix}${selected}${suffix}`;
    this.content = this.content.slice(0, start) + replacement + this.content.slice(end);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  bold(): void { this.wrap('**', '**'); }
  italic(): void { this.wrap('*', '*'); }
  quote(): void { this.insertAtCursor('> '); }

  insertAtCursor(text: string): void {
    const ta = this.textareaRef.nativeElement;
    const pos = ta.selectionStart;
    this.content = this.content.slice(0, pos) + text + this.content.slice(pos);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos + text.length, pos + text.length); });
  }

  addEmoji(emoji: string): void {
    this.insertAtCursor(emoji);
    this.showEmojiPicker = false;
  }

  // ── Prefill with quote ────────────────────────────────────────────────────

  prependQuote(author: string, text: string): void {
    const raw = text.replace(/\n/g, ' ').slice(0, 120);
    this.content = `> @${author}: ${raw}\n\n${this.content}`;
    setTimeout(() => {
      const ta = this.textareaRef?.nativeElement;
      if (ta) { ta.focus(); ta.setSelectionRange(this.content.length, this.content.length); }
    }, 50);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    const trimmed = this.content.trim();
    if (!trimmed) return;
    this.submitted.emit(trimmed);
    this.content = '';
  }

  cancel(): void {
    this.content = this.initialValue;
    this.cancelled.emit();
  }

  onKeydown(e: KeyboardEvent): void {
    // Ctrl+Enter to submit
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this.submit(); }
    // Escape to cancel
    if (e.key === 'Escape') { this.cancel(); }
  }
}
