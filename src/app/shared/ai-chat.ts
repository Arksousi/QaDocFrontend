import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-ai-chat',
  imports: [FormsModule, Icon],
  template: `
    <button class="chat-fab" (click)="toggleOpen()" aria-label="Toggle AI Assistant"><div class="chat-fab-icon"></div></button> @if (isOpen()) {
      <div class="chat-window card">
        <div class="chat-header">
          <div class="chat-title">
            <app-icon name="comment" /> QA Assistant
          </div>
          <div class="chat-actions">
            <button class="icon-btn" (click)="toggleOpen()" title="Close">
              <app-icon name="close" />
            </button>
          </div>
        </div>

        <div class="chat-messages" #scrollContainer>
          @if (messages().length === 0) {
            <div class="chat-empty">
              <p>Hi! I'm your QA Assistant. How can I help you with testing today?</p>
            </div>
          }
          @for (msg of messages(); track $index) {
            <div class="chat-msg" [class.msg-user]="msg.role === 'user'" [class.msg-ai]="msg.role === 'assistant'">
              @if (msg.role === 'assistant') {
                <div class="msg-bubble prose" [innerHTML]="formatMarkdown(msg.content)"></div>
              } @else {
                <div class="msg-bubble">{{ msg.content }}</div>
              }
            </div>
          }
          @if (loading()) {
            <div class="chat-msg msg-ai">
              <div class="msg-bubble">Thinking...</div>
            </div>
          }
        </div>

        <form class="chat-input-area" (ngSubmit)="send()">
          <input type="text" [(ngModel)]="draft" name="draft" placeholder="Ask a QA question..." autocomplete="off" [disabled]="loading()" />
          <button type="submit" class="icon-btn send-btn" [disabled]="!draft.trim() || loading()">
            <app-icon name="arrow-right" />
          </button>
        </form>
      </div>
    }
  `,
  styles: [`
    .chat-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 1000;
      width: 56px; height: 56px; border-radius: 50%;
      background: #fff; color: var(--primary);
      border: 1px solid var(--border); cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex; align-items: center; justify-content: center;
      transition: transform var(--ease), box-shadow var(--ease);
    }
    .chat-fab:hover { 
      transform: scale(1.05) translateY(-2px); 
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2); 
    }
    .chat-fab-icon {
      width: 34px; height: 34px;
      background: url('/ai-logo.png') center/contain no-repeat;
    }
    
    .chat-window {
      position: fixed; bottom: 96px; right: 24px; z-index: 1000;
      width: 380px; height: 600px; max-height: calc(100vh - 120px);
      display: flex; flex-direction: column; margin: 0; padding: 0;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12); border-radius: var(--radius-lg);
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background: var(--primary);
      color: #fff;
    }
    .chat-header .icon-btn { color: #fff; opacity: 0.8; }
    .chat-header .icon-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); }
    .chat-title { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; font-size: 1.1rem; }
    .chat-actions { display: flex; gap: var(--space-1); }
    
    .chat-messages {
      flex: 1; overflow-y: auto; padding: var(--space-4);
      display: flex; flex-direction: column; gap: var(--space-3);
      background: var(--surface);
    }
    .chat-empty { text-align: center; color: var(--muted); padding: var(--space-4); font-size: var(--fs-md); }
    
    .chat-msg { display: flex; width: 100%; }
    .msg-user { justify-content: flex-end; }
    .msg-user .msg-bubble { background: var(--primary); color: #fff; border-radius: 16px 16px 4px 16px; }
    .msg-ai .msg-bubble { background: var(--surface-2); color: var(--text); border-radius: 16px 16px 16px 4px; border: 1px solid var(--border); }
    
    .msg-bubble { padding: 12px 16px; max-width: 85%; font-size: 0.95rem; line-height: 1.5; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    
    .chat-input-area {
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border);
      background: var(--surface);
    }
    .chat-input-area input { 
      flex: 1; height: 44px; border-radius: 22px; padding: 0 20px; 
      border: 1px solid var(--border-strong); font-size: 0.95rem;
      background: var(--surface);
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);
    }
    .chat-input-area input:focus { border-color: var(--primary); outline: none; box-shadow: inset 0 1px 2px rgba(0,0,0,0.03), 0 0 0 3px rgba(37, 99, 235, 0.1); }
    .send-btn { 
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--primary); color: #fff;
      display: flex; align-items: center; justify-content: center;
      transition: background var(--ease);
    }
    .send-btn:hover:not(:disabled) { background: var(--primary-dark, #1d4ed8); }
    .send-btn:disabled { background: var(--border-strong); color: var(--muted); cursor: not-allowed; }
    
    .chat-settings { padding: var(--space-3); flex: 1; display: flex; flex-direction: column; gap: var(--space-3); }
    .chat-settings-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
    
    .msg-bubble.prose .chat-h { margin: 6px 0 4px; font-size: 1rem; font-weight: 700; color: var(--text); }
    .msg-bubble.prose .chat-ul { margin: 4px 0; padding-left: 18px; }
    .msg-bubble.prose .chat-li { margin: 2px 0; }
    .msg-bubble.prose .chat-code { 
      background: var(--surface-3, #f1f2f4); 
      border: 1px solid var(--border); 
      padding: 8px 10px; border-radius: var(--radius-sm); 
      font-size: 0.82rem; font-family: var(--font-mono);
      overflow-x: auto; margin: 6px 0; 
    }
    .msg-bubble.prose .chat-inline-code { 
      background: rgba(9, 30, 66, 0.08); 
      padding: 1px 4px; border-radius: 3px; 
      font-size: 0.85rem; font-family: var(--font-mono);
    }
    @media (max-width: 480px) {
      .chat-window {
        width: calc(100vw - 32px);
        right: 16px;
        bottom: 84px;
        height: calc(100vh - 120px);
      }
    }
  `]
})
export class AiChat {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly isOpen = signal(false);
  readonly loading = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  
  draft = '';
  
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  async toggleOpen() {
    this.isOpen.set(!this.isOpen());
  }

  formatMarkdown(text: string): string {
    if (!text) return '';
    let out = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    out = out.replace(/```([a-z]*)\n([\s\S]*?)```/gim, '<pre class="chat-code"><code>$2</code></pre>');
    out = out.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/^### (.*$)/gim, '<h4 class="chat-h">$1</h4>');
    out = out.replace(/^## (.*$)/gim, '<h3 class="chat-h">$1</h3>');
    out = out.replace(/^# (.*$)/gim, '<h2 class="chat-h">$1</h2>');
    out = out.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="chat-li">$1</li>');
    out = out.replace(/(<li class="chat-li">.*<\/li>)/gim, '<ul class="chat-ul">$1</ul>');
    out = out.replace(/\n\n/g, '<p></p>');
    out = out.replace(/\n/g, '<br/>');
    return out;
  }

  async send() {
    const text = this.draft.trim();
    if (!text) return;
    
    this.draft = '';
    const newMessages = [...this.messages(), { role: 'user', content: text } as ChatMessage];
    this.messages.set(newMessages);
    this.scrollToBottom();
    
    this.loading.set(true);
    try {
      const res = await this.api.sendAiChatMessage(newMessages);
      this.messages.set([...newMessages, res]);
    } catch {
      this.messages.set([...newMessages, { role: 'assistant', content: 'Sorry, I encountered an error communicating with the AI service.' }]);
    } finally {
      this.loading.set(false);
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer?.nativeElement) {
        const el = this.scrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}

