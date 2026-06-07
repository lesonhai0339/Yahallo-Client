import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-server-error',
  template: `
    <div class="error-page">
      <div class="error-card">
        <i class="fa-solid fa-server error-icon"></i>
        <h1>503</h1>
        <h2>{{ 'ERROR.SERVER_DOWN' | translate }}</h2>
        <p>{{ 'ERROR.SERVER_DOWN_DESC' | translate }}</p>
        <div class="error-actions">
          <button class="btn btn-primary" (click)="retry()">
            <i class="fa-solid fa-rotate-right me-2"></i>{{ 'ERROR.RETRY' | translate }}
          </button>
          <a class="btn btn-secondary" routerLink="/">
            <i class="fa-solid fa-house me-2"></i>{{ 'ERROR.BACK_HOME' | translate }}
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .error-page {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .error-card {
      text-align: center;
      max-width: 480px;
    }

    .error-icon {
      font-size: 4rem;
      color: var(--accent-primary);
      margin-bottom: 16px;
    }

    h1 {
      font-size: 4rem;
      font-weight: 800;
      color: var(--text-primary);
      margin: 0;
      line-height: 1;
    }

    h2 {
      font-size: 1.3rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 12px 0;
    }

    p {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .error-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
  `]
})
export class ServerErrorComponent {
  constructor(private router: Router) {}

  retry(): void {
    window.location.href = '/';
  }
}
