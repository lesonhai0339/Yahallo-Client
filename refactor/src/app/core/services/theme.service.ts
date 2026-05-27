import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'yhl_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private themeSubject = new BehaviorSubject<Theme>(this.getSavedTheme());
  theme$ = this.themeSubject.asObservable();

  get currentTheme(): Theme { return this.themeSubject.value; }
  get isDark(): boolean { return this.themeSubject.value === 'dark'; }

  private getSavedTheme(): Theme {
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark';
  }

  apply(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  toggle(): void {
    this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.themeSubject.next(theme);
  }
}
